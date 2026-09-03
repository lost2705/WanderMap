package io.github.lost2705.wandermap.travel.api;

import io.github.lost2705.wandermap.identity.application.CurrentUserUnavailableException;
import io.github.lost2705.wandermap.identity.application.DuplicateEmailException;
import io.github.lost2705.wandermap.identity.application.InvalidCredentialsException;
import io.github.lost2705.wandermap.travel.application.CountryNotFoundException;
import io.github.lost2705.wandermap.travel.application.BucketListItemNotFoundException;
import io.github.lost2705.wandermap.travel.application.CityNotFoundException;
import io.github.lost2705.wandermap.travel.application.DuplicateBucketListCityException;
import io.github.lost2705.wandermap.travel.application.GeocodingUnavailableException;
import io.github.lost2705.wandermap.travel.application.TripNotFoundException;
import io.github.lost2705.wandermap.travel.application.PhotoStorageException;
import io.github.lost2705.wandermap.travel.application.PhotoValidationException;
import io.github.lost2705.wandermap.travel.domain.TripStopNotFoundException;
import io.github.lost2705.wandermap.travel.domain.TripStopPhotoNotFoundException;
import jakarta.validation.ConstraintViolationException;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

@RestControllerAdvice
public class TravelExceptionHandler {

    @ExceptionHandler(DuplicateEmailException.class)
    ProblemDetail handleDuplicateEmail(DuplicateEmailException exception) {
        return problem(HttpStatus.CONFLICT, "Email already registered", exception.getMessage(), "EMAIL_ALREADY_EXISTS");
    }

    @ExceptionHandler(InvalidCredentialsException.class)
    ProblemDetail handleInvalidCredentials(InvalidCredentialsException exception) {
        return problem(HttpStatus.UNAUTHORIZED, "Invalid credentials", exception.getMessage(), "INVALID_CREDENTIALS");
    }

    @ExceptionHandler(CurrentUserUnavailableException.class)
    ProblemDetail handleCurrentUserUnavailable(CurrentUserUnavailableException exception) {
        return problem(HttpStatus.UNAUTHORIZED, "Authentication required", exception.getMessage(), "AUTH_REQUIRED");
    }

    @ExceptionHandler(TripNotFoundException.class)
    ProblemDetail handleTripNotFound(TripNotFoundException exception) {
        return problem(HttpStatus.NOT_FOUND, "Trip not found", exception.getMessage(), "TRIP_NOT_FOUND");
    }

    @ExceptionHandler(CountryNotFoundException.class)
    ProblemDetail handleCountryNotFound(CountryNotFoundException exception) {
        return problem(HttpStatus.NOT_FOUND, "Country not found", exception.getMessage(), "COUNTRY_NOT_FOUND");
    }

    @ExceptionHandler(TripStopNotFoundException.class)
    ProblemDetail handleTripStopNotFound(TripStopNotFoundException exception) {
        return problem(HttpStatus.NOT_FOUND, "Trip stop not found", exception.getMessage(), "TRIP_STOP_NOT_FOUND");
    }

    @ExceptionHandler(BucketListItemNotFoundException.class)
    ProblemDetail handleBucketListItemNotFound(BucketListItemNotFoundException exception) {
        return problem(
                HttpStatus.NOT_FOUND,
                "Bucket list item not found",
                exception.getMessage(),
                "BUCKET_LIST_ITEM_NOT_FOUND");
    }

    @ExceptionHandler(DuplicateBucketListCityException.class)
    ProblemDetail handleDuplicateBucketListCity(DuplicateBucketListCityException exception) {
        return problem(
                HttpStatus.CONFLICT,
                "Place already saved",
                exception.getMessage(),
                "BUCKET_LIST_DUPLICATE");
    }

    @ExceptionHandler(CityNotFoundException.class)
    ProblemDetail handleCityNotFound(CityNotFoundException exception) {
        return problem(HttpStatus.NOT_FOUND, "Place not found", exception.getMessage(), "PLACE_NOT_FOUND");
    }

    @ExceptionHandler(TripStopPhotoNotFoundException.class)
    ProblemDetail handleTripStopPhotoNotFound(TripStopPhotoNotFoundException exception) {
        return problem(HttpStatus.NOT_FOUND, "Photo not found", exception.getMessage(), "PHOTO_NOT_FOUND");
    }

    @ExceptionHandler(PhotoValidationException.class)
    ProblemDetail handlePhotoValidation(PhotoValidationException exception) {
        return switch (exception.getReason()) {
            case EMPTY -> problem(HttpStatus.BAD_REQUEST, "Empty photo", exception.getMessage(), "PHOTO_EMPTY");
            case UNSUPPORTED_TYPE -> problem(
                    HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                    "Unsupported photo type",
                    exception.getMessage(),
                    "PHOTO_UNSUPPORTED_TYPE");
            case TOO_LARGE -> problem(
                    HttpStatus.PAYLOAD_TOO_LARGE,
                    "Photo too large",
                    exception.getMessage(),
                    "PHOTO_TOO_LARGE");
            case INVALID_CONTENT -> problem(
                    HttpStatus.BAD_REQUEST,
                    "Invalid photo content",
                    exception.getMessage(),
                    "PHOTO_INVALID_CONTENT");
        };
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ProblemDetail handleMaximumUploadSize(MaxUploadSizeExceededException exception) {
        return problem(
                HttpStatus.PAYLOAD_TOO_LARGE,
                "Photo too large",
                "photo file exceeds the configured upload limit",
                "PHOTO_TOO_LARGE");
    }

    @ExceptionHandler(PhotoStorageException.class)
    ProblemDetail handlePhotoStorageFailure(PhotoStorageException exception) {
        return problem(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Photo storage unavailable",
                exception.getMessage(),
                "PHOTO_STORAGE_FAILURE");
    }

    @ExceptionHandler(GeocodingUnavailableException.class)
    ProblemDetail handleGeocodingUnavailable(GeocodingUnavailableException exception) {
        return problem(
                HttpStatus.SERVICE_UNAVAILABLE,
                "City search unavailable",
                exception.getMessage(),
                "GEOCODING_UNAVAILABLE");
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ProblemDetail handleValidation(MethodArgumentNotValidException exception) {
        ProblemDetail problem = problem(
                HttpStatus.BAD_REQUEST,
                "Validation failed",
                "One or more request fields are invalid",
                "VALIDATION_FAILED");
        List<FieldViolation> errors = exception.getBindingResult().getFieldErrors().stream()
                .map(TravelExceptionHandler::toFieldViolation)
                .toList();
        problem.setProperty("errors", errors);
        return problem;
    }

    @ExceptionHandler(ConstraintViolationException.class)
    ProblemDetail handleConstraintViolation(ConstraintViolationException exception) {
        return problem(HttpStatus.BAD_REQUEST, "Validation failed", exception.getMessage(), "VALIDATION_FAILED");
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    ProblemDetail handleUnreadableRequest(Exception exception) {
        return problem(
                HttpStatus.BAD_REQUEST,
                "Invalid request",
                "Request body or path value is malformed",
                "INVALID_REQUEST");
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ProblemDetail handleInvalidBusinessInput(IllegalArgumentException exception) {
        return problem(HttpStatus.BAD_REQUEST, "Invalid request", exception.getMessage(), "INVALID_REQUEST");
    }

    private static ProblemDetail problem(HttpStatus status, String title, String detail, String code) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setTitle(title);
        problem.setProperty("code", code);
        return problem;
    }

    private static FieldViolation toFieldViolation(FieldError error) {
        String message = error.getDefaultMessage() == null ? "is invalid" : error.getDefaultMessage();
        return new FieldViolation(error.getField(), message);
    }

    private record FieldViolation(String field, String message) {
    }
}
