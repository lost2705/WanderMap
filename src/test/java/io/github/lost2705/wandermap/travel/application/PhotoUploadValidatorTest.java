package io.github.lost2705.wandermap.travel.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

class PhotoUploadValidatorTest {

    private final PhotoUploadValidator validator = new PhotoUploadValidator(2048);

    @Test
    void acceptsJpegAndPngImages() {
        assertThat(validate("photo.jpg", "image/jpeg", imageBytes("jpg"))).isEqualTo("image/jpeg");
        assertThat(validate("photo.png", "image/png", imageBytes("png"))).isEqualTo("image/png");
    }

    @Test
    void acceptsStructurallyValidVp8Webp() {
        assertThat(validate("photo.webp", "image/webp", webp(chunk("VP8 ", bytes(1, 2, 3, 4)))))
                .isEqualTo("image/webp");
    }

    @Test
    void acceptsStructurallyValidVp8lWebp() {
        assertThat(validate("photo.webp", "image/webp", webp(chunk("VP8L", bytes(0x2f, 1, 2, 3, 4)))))
                .isEqualTo("image/webp");
    }

    @Test
    void acceptsStructurallyValidVp8xWebp() {
        assertThat(validate("photo.webp", "image/webp", webp(chunk("VP8X", new byte[10]))))
                .isEqualTo("image/webp");
    }

    @Test
    void rejectsBareRiffWebpHeader() {
        byte[] header = bytes(
                'R', 'I', 'F', 'F',
                4, 0, 0, 0,
                'W', 'E', 'B', 'P');

        assertInvalidWebp(header);
    }

    @Test
    void rejectsIncorrectRiffSize() {
        byte[] content = webp(chunk("VP8 ", bytes(1, 2, 3, 4)));
        writeUnsignedLittleEndianInt(content, 4, content.length - 9L);

        assertInvalidWebp(content);
    }

    @Test
    void rejectsTruncatedWebpChunk() {
        byte[] complete = webp(chunk("VP8 ", bytes(1, 2, 3, 4)));
        byte[] truncated = Arrays.copyOf(complete, complete.length - 2);
        writeUnsignedLittleEndianInt(truncated, 4, truncated.length - 8L);

        assertInvalidWebp(truncated);
    }

    @Test
    void rejectsContainerWithoutAWebpImageChunk() {
        assertInvalidWebp(webp(chunk("EXIF", bytes(1, 2, 3, 4))));
    }

    @Test
    void rejectsChunkWhoseUnsignedSizeExceedsTheContainer() {
        byte[] content = webp(chunk("VP8 ", new byte[0]));
        writeUnsignedLittleEndianInt(content, 16, 0xffff_ffffL);

        assertInvalidWebp(content);
    }

    @Test
    void handlesOddSizedChunkPadding() {
        byte[] padded = webp(
                chunk("EXIF", bytes(1)),
                chunk("VP8 ", bytes(2, 3, 4)));
        assertThat(validate("photo.webp", "image/webp", padded)).isEqualTo("image/webp");

        byte[] missingPadding = Arrays.copyOf(webp(chunk("VP8 ", bytes(1))), 21);
        writeUnsignedLittleEndianInt(missingPadding, 4, missingPadding.length - 8L);
        assertInvalidWebp(missingPadding);
    }

    @Test
    void rejectsEmptyUnsupportedOversizedAndMismatchedUploads() {
        assertReason(new PhotoUpload("empty.jpg", "image/jpeg", new byte[0]), PhotoValidationException.Reason.EMPTY);
        assertReason(
                new PhotoUpload("notes.txt", "text/plain", bytes(0xff, 0xd8, 0xff)),
                PhotoValidationException.Reason.UNSUPPORTED_TYPE);
        assertReason(
                new PhotoUpload("large.jpg", "image/jpeg", new byte[2049]),
                PhotoValidationException.Reason.TOO_LARGE);
        assertReason(
                new PhotoUpload("fake.png", "image/png", bytes(0xff, 0xd8, 0xff)),
                PhotoValidationException.Reason.INVALID_CONTENT);
    }

    @Test
    void keepsOnlyTheDisplayNameFromAnUntrustedClientFilename() {
        PhotoUploadValidator.ValidatedPhoto photo = validator.validate(new PhotoUpload(
                "../../memories/été in Rome.jpg",
                "image/jpeg; charset=binary",
                imageBytes("jpg")));

        assertThat(photo.originalFilename()).isEqualTo("été in Rome.jpg");
        assertThat(photo.contentType()).isEqualTo("image/jpeg");
    }

    private String validate(String filename, String contentType, byte[] content) {
        return validator.validate(new PhotoUpload(filename, contentType, content)).contentType();
    }

    private void assertReason(PhotoUpload upload, PhotoValidationException.Reason reason) {
        assertThatThrownBy(() -> validator.validate(upload))
                .isInstanceOf(PhotoValidationException.class)
                .extracting(exception -> ((PhotoValidationException) exception).getReason())
                .isEqualTo(reason);
    }

    private void assertInvalidWebp(byte[] content) {
        assertReason(
                new PhotoUpload("photo.webp", "image/webp", content),
                PhotoValidationException.Reason.INVALID_CONTENT);
    }

    private static WebpChunk chunk(String type, byte[] payload) {
        return new WebpChunk(type, payload);
    }

    private static byte[] webp(WebpChunk... chunks) {
        int size = 12;
        for (WebpChunk chunk : chunks) {
            size += 8 + chunk.payload().length + (chunk.payload().length & 1);
        }

        byte[] content = new byte[size];
        writeFourCc(content, 0, "RIFF");
        writeUnsignedLittleEndianInt(content, 4, content.length - 8L);
        writeFourCc(content, 8, "WEBP");

        int offset = 12;
        for (WebpChunk chunk : chunks) {
            writeFourCc(content, offset, chunk.type());
            writeUnsignedLittleEndianInt(content, offset + 4, chunk.payload().length);
            System.arraycopy(chunk.payload(), 0, content, offset + 8, chunk.payload().length);
            offset += 8 + chunk.payload().length + (chunk.payload().length & 1);
        }
        return content;
    }

    private static void writeFourCc(byte[] content, int offset, String value) {
        byte[] encoded = value.getBytes(StandardCharsets.US_ASCII);
        if (encoded.length != 4) {
            throw new IllegalArgumentException("FourCC must contain four ASCII bytes");
        }
        System.arraycopy(encoded, 0, content, offset, encoded.length);
    }

    private static void writeUnsignedLittleEndianInt(byte[] content, int offset, long value) {
        for (int index = 0; index < 4; index++) {
            content[offset + index] = (byte) (value >>> (index * 8));
        }
    }

    private static byte[] bytes(int... values) {
        byte[] result = new byte[values.length];
        for (int index = 0; index < values.length; index++) {
            result[index] = (byte) values[index];
        }
        return result;
    }

    private static byte[] imageBytes(String format) {
        try {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            ImageIO.write(new BufferedImage(1, 1, BufferedImage.TYPE_INT_RGB), format, output);
            return output.toByteArray();
        } catch (IOException exception) {
            throw new AssertionError(exception);
        }
    }

    private record WebpChunk(String type, byte[] payload) {}
}
