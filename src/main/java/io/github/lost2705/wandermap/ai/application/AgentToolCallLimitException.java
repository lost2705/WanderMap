package io.github.lost2705.wandermap.ai.application;

public class AgentToolCallLimitException extends RuntimeException {

    public AgentToolCallLimitException(int maximumToolCalls) {
        super("Travel Assistant exceeded its limit of " + maximumToolCalls + " tool calls");
    }
}
