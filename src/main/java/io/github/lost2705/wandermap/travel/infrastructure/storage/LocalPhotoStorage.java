package io.github.lost2705.wandermap.travel.infrastructure.storage;

import io.github.lost2705.wandermap.travel.application.PhotoStorage;
import io.github.lost2705.wandermap.travel.application.PhotoStorageException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.UUID;

public class LocalPhotoStorage implements PhotoStorage {

    private final Path root;

    public LocalPhotoStorage(Path root) {
        this.root = root.toAbsolutePath().normalize();
    }

    @Override
    public String store(byte[] content) {
        String identifier = UUID.randomUUID().toString();
        String storageKey = identifier.substring(0, 2) + "/" + identifier;
        Path target = resolveKey(storageKey);
        try {
            Files.createDirectories(target.getParent());
            Files.write(target, content, StandardOpenOption.CREATE_NEW);
            return storageKey;
        } catch (IOException exception) {
            throw new PhotoStorageException("Could not store photo", exception);
        }
    }

    @Override
    public byte[] read(String storageKey) {
        try {
            return Files.readAllBytes(resolveKey(storageKey));
        } catch (IOException exception) {
            throw new PhotoStorageException("Could not read stored photo", exception);
        }
    }

    @Override
    public void delete(String storageKey) {
        try {
            Files.deleteIfExists(resolveKey(storageKey));
        } catch (IOException exception) {
            throw new PhotoStorageException("Could not delete stored photo", exception);
        }
    }

    private Path resolveKey(String storageKey) {
        if (storageKey == null || storageKey.isBlank()) {
            throw new PhotoStorageException("Photo storage key must not be blank");
        }
        Path resolved = root.resolve(storageKey).normalize();
        if (!resolved.startsWith(root)) {
            throw new PhotoStorageException("Photo storage key escapes the configured root");
        }
        return resolved;
    }
}

