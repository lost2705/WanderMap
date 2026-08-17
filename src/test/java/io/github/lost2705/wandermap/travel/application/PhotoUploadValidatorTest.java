package io.github.lost2705.wandermap.travel.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

class PhotoUploadValidatorTest {

    private final PhotoUploadValidator validator = new PhotoUploadValidator(2048);

    @Test
    void acceptsJpegPngAndWebpSignatures() {
        assertThat(validate("photo.jpg", "image/jpeg", imageBytes("jpg"))).isEqualTo("image/jpeg");
        assertThat(validate("photo.png", "image/png", imageBytes("png"))).isEqualTo("image/png");
        assertThat(validate(
                "photo.webp", "image/webp", bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50)))
                .isEqualTo("image/webp");
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
}
