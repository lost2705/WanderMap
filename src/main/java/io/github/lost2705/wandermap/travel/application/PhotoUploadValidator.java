package io.github.lost2705.wandermap.travel.application;

import static io.github.lost2705.wandermap.travel.application.PhotoValidationException.Reason.EMPTY;
import static io.github.lost2705.wandermap.travel.application.PhotoValidationException.Reason.INVALID_CONTENT;
import static io.github.lost2705.wandermap.travel.application.PhotoValidationException.Reason.TOO_LARGE;
import static io.github.lost2705.wandermap.travel.application.PhotoValidationException.Reason.UNSUPPORTED_TYPE;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Locale;
import java.util.Set;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;

public class PhotoUploadValidator {

    private static final Set<String> SUPPORTED_TYPES = Set.of("image/jpeg", "image/png", "image/webp");
    private static final long MAXIMUM_DECODED_PIXELS = 25_000_000;

    private final long maximumSize;

    public PhotoUploadValidator(long maximumSize) {
        if (maximumSize < 1) {
            throw new IllegalArgumentException("photo maximum size must be positive");
        }
        this.maximumSize = maximumSize;
    }

    public ValidatedPhoto validate(PhotoUpload upload) {
        byte[] content = upload.content();
        if (content.length == 0) {
            throw new PhotoValidationException(EMPTY, "photo file must not be empty");
        }
        if (content.length > maximumSize) {
            throw new PhotoValidationException(
                    TOO_LARGE,
                    "photo file must not exceed " + maximumSize + " bytes");
        }

        String contentType = normalizeContentType(upload.contentType());
        if (!SUPPORTED_TYPES.contains(contentType)) {
            throw new PhotoValidationException(
                    UNSUPPORTED_TYPE,
                    "photo content type must be image/jpeg, image/png, or image/webp");
        }
        if (!hasExpectedSignature(contentType, content) || !canDecode(contentType, content)) {
            throw new PhotoValidationException(
                    INVALID_CONTENT,
                    "photo data does not match its declared content type");
        }

        return new ValidatedPhoto(safeFilename(upload.originalFilename()), contentType, content);
    }

    private static String normalizeContentType(String value) {
        if (value == null) {
            return "";
        }
        int parametersStart = value.indexOf(';');
        String mediaType = parametersStart >= 0 ? value.substring(0, parametersStart) : value;
        return mediaType.strip().toLowerCase(Locale.ROOT);
    }

    private static String safeFilename(String value) {
        if (value == null || value.isBlank()) {
            return "photo";
        }
        String normalized = value.replace('\\', '/');
        normalized = normalized.substring(normalized.lastIndexOf('/') + 1).strip();
        normalized = normalized.chars()
                .map(character -> Character.isISOControl(character) ? '_' : character)
                .collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append)
                .toString();
        if (normalized.isEmpty() || normalized.equals(".") || normalized.equals("..")) {
            return "photo";
        }
        return normalized.length() <= 255 ? normalized : normalized.substring(normalized.length() - 255);
    }

    private static boolean hasExpectedSignature(String contentType, byte[] content) {
        return switch (contentType) {
            case "image/jpeg" -> startsWith(content, 0xff, 0xd8, 0xff);
            case "image/png" -> startsWith(content, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
            case "image/webp" -> startsWith(content, 0x52, 0x49, 0x46, 0x46)
                    && content.length >= 12
                    && content[8] == 0x57
                    && content[9] == 0x45
                    && content[10] == 0x42
                    && content[11] == 0x50;
            default -> false;
        };
    }

    private static boolean startsWith(byte[] content, int... prefix) {
        if (content.length < prefix.length) {
            return false;
        }
        for (int index = 0; index < prefix.length; index++) {
            if (Byte.toUnsignedInt(content[index]) != prefix[index]) {
                return false;
            }
        }
        return true;
    }

    private static boolean canDecode(String contentType, byte[] content) {
        if (contentType.equals("image/webp")) {
            // The JDK has no built-in WebP codec; V1 still validates its RIFF/WEBP container signature.
            return true;
        }
        try (ImageInputStream input = ImageIO.createImageInputStream(new ByteArrayInputStream(content))) {
            if (input == null) {
                return false;
            }
            java.util.Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) {
                return false;
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(input, true, true);
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                if (width < 1 || height < 1 || (long) width * height > MAXIMUM_DECODED_PIXELS) {
                    return false;
                }
                return reader.read(0) != null;
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException exception) {
            return false;
        }
    }

    public record ValidatedPhoto(String originalFilename, String contentType, byte[] content) {

        public ValidatedPhoto {
            content = content.clone();
        }

        @Override
        public byte[] content() {
            return content.clone();
        }
    }
}
