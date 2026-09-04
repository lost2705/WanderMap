package io.github.lost2705.wandermap.ai.application;

public class AgentContextLimitException extends RuntimeException {

    public AgentContextLimitException(int maximumToolResultCharacters) {
        super("Travel Assistant exceeded its limit of "
                + maximumToolResultCharacters
                + " tool-result characters");
    }
}
