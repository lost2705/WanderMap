package io.github.lost2705.wandermap.travel.application;

/** Provider-neutral storage boundary for photo binary data. */
public interface PhotoStorage {

    String store(byte[] content);

    byte[] read(String storageKey);

    void delete(String storageKey);
}

