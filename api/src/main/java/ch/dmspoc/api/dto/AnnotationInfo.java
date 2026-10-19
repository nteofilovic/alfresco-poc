package ch.dmspoc.api.dto;

/**
 * State of a document's annotations. {@code revision} counts saves (0 = none yet) and is what a client sends
 * back to detect concurrent edits; {@code outdated} means the original got a new version after they were made.
 */
public record AnnotationInfo(
        boolean exists,
        boolean outdated,
        String baseVersion,
        String currentVersion,
        long revision,
        String updatedBy,
        String updatedAt) {

    public static AnnotationInfo none(String currentVersion) {
        return new AnnotationInfo(false, false, null, currentVersion, 0, null, null);
    }
}
