package io.github.lost2705.wandermap.ai.application;

public interface AiModelClient {

    AiModelResponse chat(AiModelRequest request);
}
