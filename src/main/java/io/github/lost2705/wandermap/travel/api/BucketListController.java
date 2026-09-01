package io.github.lost2705.wandermap.travel.api;

import io.github.lost2705.wandermap.travel.api.dto.AddBucketListItemRequest;
import io.github.lost2705.wandermap.travel.api.dto.BucketListItemResponse;
import io.github.lost2705.wandermap.travel.application.BucketListEntry;
import io.github.lost2705.wandermap.travel.application.BucketListService;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/bucket-list")
public class BucketListController {

    private final BucketListService bucketListService;

    public BucketListController(BucketListService bucketListService) {
        this.bucketListService = bucketListService;
    }

    @GetMapping
    public List<BucketListItemResponse> listItems() {
        return bucketListService.listItems().stream().map(BucketListController::toResponse).toList();
    }

    @PostMapping
    public ResponseEntity<BucketListItemResponse> addItem(@Valid @RequestBody AddBucketListItemRequest request) {
        BucketListEntry created = bucketListService.add(
                request.countryCode(), request.cityName(), request.latitude(), request.longitude());
        return ResponseEntity.created(URI.create("/api/bucket-list/" + created.item().getId()))
                .body(toResponse(created));
    }

    @DeleteMapping("/{itemId}")
    public ResponseEntity<Void> removeItem(@PathVariable UUID itemId) {
        bucketListService.remove(itemId);
        return ResponseEntity.noContent().build();
    }

    private static BucketListItemResponse toResponse(BucketListEntry entry) {
        return new BucketListItemResponse(
                entry.item().getId(),
                TravelApiMapper.toResponse(entry.item().getCity()),
                entry.item().getCreatedAt(),
                entry.visited());
    }
}
