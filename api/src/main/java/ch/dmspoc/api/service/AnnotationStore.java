package ch.dmspoc.api.service;

import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Where annotated copies of PDFs live: {@code zapis-config/annotations/<nodeId>.pdf} plus a small
 * {@code <nodeId>.json} describing it. The original document is never touched. Access is checked by the caller
 * (with the user's ticket) before anything here is used, because this store runs as the service account.
 */
@Component
public class AnnotationStore {

    static final String FOLDER = "annotations";

    /** @param baseVersion {@code cm:versionLabel} of the original the annotations were made on */
    public record Meta(String baseVersion, String updatedBy, String updatedAt, long revision) {
    }

    private final ConfigStore store;
    private final ObjectMapper mapper;

    public AnnotationStore(ConfigStore store, ObjectMapper mapper) {
        this.store = store;
        this.mapper = mapper;
    }

    public Optional<Meta> meta(String nodeId) {
        return store.read(FOLDER, nodeId + ".json").map(bytes -> mapper.readValue(bytes, Meta.class));
    }

    private static final long IDS_TTL_MILLIS = 5_000;
    private volatile Set<String> idsCache = Set.of();
    private volatile long idsCachedAt = 0;

    /**
     * Ids of every node that has annotations, from a single folder listing. Kept for a few seconds because every
     * file listing asks; saving or discarding annotations drops it so the next listing is exact.
     */
    public Set<String> annotatedIds() {
        long now = System.currentTimeMillis();
        if (now - idsCachedAt > IDS_TTL_MILLIS) {
            idsCache = store.listNames(FOLDER).stream()
                    .filter(n -> n.endsWith(".json"))
                    .map(n -> n.substring(0, n.length() - ".json".length()))
                    .collect(Collectors.toSet());
            idsCachedAt = now;
        }
        return idsCache;
    }

    public Optional<byte[]> pdf(String nodeId) {
        return store.read(FOLDER, nodeId + ".pdf");
    }

    /** The PDF goes first: a failure in between leaves the previous metadata, so the revision check still holds. */
    public void save(String nodeId, byte[] pdf, Meta meta) {
        store.write(FOLDER, nodeId + ".pdf", pdf, "application/pdf");
        store.write(FOLDER, nodeId + ".json", mapper.writeValueAsBytes(meta), "application/json");
        idsCachedAt = 0;
    }

    public void delete(String nodeId) {
        store.delete(FOLDER, nodeId + ".json");
        store.delete(FOLDER, nodeId + ".pdf");
        idsCachedAt = 0;
    }
}
