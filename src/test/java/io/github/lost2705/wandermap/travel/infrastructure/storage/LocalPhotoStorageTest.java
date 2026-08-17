package io.github.lost2705.wandermap.travel.infrastructure.storage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.github.lost2705.wandermap.travel.application.PhotoStorageException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class LocalPhotoStorageTest {

    @TempDir
    private Path temporaryDirectory;

    @Test
    void storesReadsAndDeletesUnderAGeneratedKey() throws Exception {
        LocalPhotoStorage storage = new LocalPhotoStorage(temporaryDirectory);
        byte[] content = {1, 2, 3, 4};

        String storageKey = storage.store(content);

        assertThat(storageKey).doesNotContain("photo.jpg").doesNotContain("..");
        assertThat(storage.read(storageKey)).containsExactly(content);
        assertThat(Files.exists(temporaryDirectory.resolve(storageKey))).isTrue();

        storage.delete(storageKey);

        assertThat(Files.exists(temporaryDirectory.resolve(storageKey))).isFalse();
    }

    @Test
    void rejectsStorageKeysThatEscapeTheConfiguredRoot() {
        LocalPhotoStorage storage = new LocalPhotoStorage(temporaryDirectory);

        assertThatThrownBy(() -> storage.read("../outside.jpg"))
                .isInstanceOf(PhotoStorageException.class)
                .hasMessage("Photo storage key escapes the configured root");
    }
}

