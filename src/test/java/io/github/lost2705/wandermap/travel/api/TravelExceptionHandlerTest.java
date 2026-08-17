package io.github.lost2705.wandermap.travel.api;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.lost2705.wandermap.travel.application.PhotoStorageException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;

class TravelExceptionHandlerTest {

    @Test
    void translatesStorageFailuresIntoAControlledServiceUnavailableProblem() {
        ProblemDetail problem = new TravelExceptionHandler()
                .handlePhotoStorageFailure(new PhotoStorageException("Could not store photo"));

        assertThat(problem.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE.value());
        assertThat(problem.getProperties()).containsEntry("code", "PHOTO_STORAGE_FAILURE");
    }
}

