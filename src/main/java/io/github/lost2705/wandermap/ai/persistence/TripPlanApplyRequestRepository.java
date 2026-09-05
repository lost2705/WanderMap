package io.github.lost2705.wandermap.ai.persistence;

import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Narrow, transactional idempotency ledger; it stores no draft or provider state. */
@Repository
public class TripPlanApplyRequestRepository {

    private final JdbcClient jdbc;

    public TripPlanApplyRequestRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public boolean claim(UUID userId, UUID requestId, String payloadHash) {
        // PostgreSQL waits for a concurrent conflicting transaction to commit/roll back.
        return jdbc.sql("""
                INSERT INTO trip_plan_apply_requests (user_id, request_id, payload_hash)
                VALUES (:userId, :requestId, :payloadHash)
                ON CONFLICT (user_id, request_id) DO NOTHING
                """)
                .param("userId", userId).param("requestId", requestId).param("payloadHash", payloadHash)
                .update() == 1;
    }

    public AppliedRequest get(UUID userId, UUID requestId) {
        return jdbc.sql("""
                SELECT payload_hash, trip_id FROM trip_plan_apply_requests
                WHERE user_id = :userId AND request_id = :requestId
                """)
                .param("userId", userId).param("requestId", requestId)
                .query((row, index) -> new AppliedRequest(
                        row.getString("payload_hash"), row.getObject("trip_id", UUID.class)))
                .single();
    }

    public void complete(UUID userId, UUID requestId, UUID tripId) {
        jdbc.sql("""
                UPDATE trip_plan_apply_requests SET trip_id = :tripId
                WHERE user_id = :userId AND request_id = :requestId
                """)
                .param("tripId", tripId).param("userId", userId).param("requestId", requestId).update();
    }

    public record AppliedRequest(String payloadHash, UUID tripId) {
    }
}
