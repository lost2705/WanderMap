package io.github.lost2705.wandermap.travel.api;

import io.github.lost2705.wandermap.travel.application.CountryNotFoundException;
import io.github.lost2705.wandermap.travel.application.GeocodingUnavailableException;
import io.github.lost2705.wandermap.travel.application.TripNotFoundException;
import io.github.lost2705.wandermap.travel.domain.TripStopNotFoundException;
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

@RestControllerAdvice
public class TravelExceptionHandler {

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
