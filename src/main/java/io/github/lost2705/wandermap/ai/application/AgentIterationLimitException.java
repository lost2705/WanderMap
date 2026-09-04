package io.github.lost2705.wandermap.ai.application;

public class AgentIterationLimitException extends RuntimeException {

    public AgentIterationLimitException(int maximumIterations) {
        super("Travel Assistant exceeded its limit of " + maximumIterations + " model iterations");
    }
}
