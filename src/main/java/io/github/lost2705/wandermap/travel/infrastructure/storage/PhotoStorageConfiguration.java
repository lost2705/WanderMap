package io.github.lost2705.wandermap.travel.infrastructure.storage;

import io.github.lost2705.wandermap.travel.application.PhotoStorage;
import io.github.lost2705.wandermap.travel.application.PhotoUploadValidator;
import java.nio.file.Path;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.unit.DataSize;

@Configuration(proxyBeanMethods = false)
class PhotoStorageConfiguration {

    @Bean
    PhotoStorage photoStorage(@Value("${wandermap.storage.photos.root}") String root) {
        return new LocalPhotoStorage(Path.of(root));
    }

    @Bean
    PhotoUploadValidator photoUploadValidator(
            @Value("${wandermap.storage.photos.max-size}") DataSize maximumSize) {
        return new PhotoUploadValidator(maximumSize.toBytes());
    }
}

