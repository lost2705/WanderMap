package io.github.lost2705.wandermap.travel.application;

import java.util.Collection;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Component
public class PhotoFileLifecycle {

    private static final Logger LOGGER = LoggerFactory.getLogger(PhotoFileLifecycle.class);

    private final PhotoStorage photoStorage;

    public PhotoFileLifecycle(PhotoStorage photoStorage) {
        this.photoStorage = photoStorage;
    }

    public String store(byte[] content) {
        return photoStorage.store(content);
    }

    public byte[] read(String storageKey) {
        return photoStorage.read(storageKey);
    }

    public void deleteNow(String storageKey) {
        photoStorage.delete(storageKey);
    }

    public void deleteIfTransactionRollsBack(String storageKey) {
        if (!transactionSynchronizationActive()) {
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status == STATUS_ROLLED_BACK) {
                    deleteBestEffort(storageKey);
                }
            }
        });
    }

    public void deleteAfterCommit(Collection<String> storageKeys) {
        List<String> keys = storageKeys.stream().distinct().toList();
        if (keys.isEmpty()) {
            return;
        }
        if (!transactionSynchronizationActive()) {
            keys.forEach(this::deleteBestEffort);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                keys.forEach(PhotoFileLifecycle.this::deleteBestEffort);
            }
        });
    }

    private static boolean transactionSynchronizationActive() {
        return TransactionSynchronizationManager.isSynchronizationActive()
                && TransactionSynchronizationManager.isActualTransactionActive();
    }

    private void deleteBestEffort(String storageKey) {
        try {
            photoStorage.delete(storageKey);
        } catch (RuntimeException exception) {
            LOGGER.error("Could not delete stored photo {} after its database change committed", storageKey, exception);
        }
    }
}

