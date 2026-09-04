package io.github.lost2705.wandermap.ai.api;

import io.github.lost2705.wandermap.ai.application.AgentContextLimitException;
import io.github.lost2705.wandermap.ai.application.AgentIterationLimitException;
import io.github.lost2705.wandermap.ai.application.AgentToolCallLimitException;
import io.github.lost2705.wandermap.ai.application.AiProviderException;
import io.github.lost2705.wandermap.ai.application.InvalidTripPlanException;
import io.github.lost2705.wandermap.ai.application.InvalidTripPlanRequestException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class AiExceptionHandler {

    @ExceptionHandler(InvalidTripPlanRequestException.class)
    ProblemDetail handleInvalidPlanRequest(InvalidTripPlanRequestException exception) {
        return problem(
                HttpStatus.BAD_REQUEST,
                "Invalid trip plan request",
                "The current trip-plan draft is invalid. Start a new plan and try again.",
                "INVALID_REQUEST");
    }

    @ExceptionHandler(InvalidTripPlanException.class)
    ProblemDetail handleInvalidPlan(InvalidTripPlanException exception) {
        return problem(
                HttpStatus.BAD_GATEWAY,
                "Trip plan validation failed",
                "WanderMap could not create a consistent trip-plan draft. Please adjust the request and try again.",
                "AI_INVALID_PLAN");
    }

    @ExceptionHandler(AiProviderException.class)
    ProblemDetail handleProviderFailure(AiProviderException exception) {
        return switch (exception.getReason()) {
            case DISABLED -> problem(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Travel Assistant unavailable",
                    "Travel Assistant is temporarily unavailable.",
                    "AI_DISABLED");
            case RATE_LIMITED -> problem(
                    HttpStatus.TOO_MANY_REQUESTS,
                    "Travel Assistant busy",
                    "Travel Assistant is receiving too many requests. Please try again shortly.",
                    "AI_RATE_LIMITED");
            case UNAVAILABLE -> problem(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Travel Assistant unavailable",
                    "Travel Assistant is temporarily unavailable.",
                    "AI_UNAVAILABLE");
            case MALFORMED_RESPONSE -> problem(
                    HttpStatus.BAD_GATEWAY,
                    "Travel Assistant response failed",
                    "Travel Assistant could not complete this request. Please try again.",
                    "AI_INVALID_RESPONSE");
        };
    }

    @ExceptionHandler(AgentIterationLimitException.class)
    ProblemDetail handleIterationLimit(AgentIterationLimitException exception) {
        return problem(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Travel Assistant could not finish",
                "Travel Assistant could not complete this request within its tool limit.",
                "AI_ITERATION_LIMIT");
    }

    @ExceptionHandler(AgentToolCallLimitException.class)
    ProblemDetail handleToolCallLimit(AgentToolCallLimitException exception) {
        return problem(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Travel Assistant could not finish",
                "Travel Assistant could not complete this request within its tool-call limit.",
                "AI_TOOL_CALL_LIMIT");
    }

    @ExceptionHandler(AgentContextLimitException.class)
    ProblemDetail handleContextLimit(AgentContextLimitException exception) {
        return problem(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Travel Assistant context is too large",
                "Travel Assistant could not process this amount of travel data in one request.",
                "AI_CONTEXT_LIMIT");
    }

    private static ProblemDetail problem(HttpStatus status, String title, String detail, String code) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setTitle(title);
        problem.setProperty("code", code);
        return problem;
    }
}
