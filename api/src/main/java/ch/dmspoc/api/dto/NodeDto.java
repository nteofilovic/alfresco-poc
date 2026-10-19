package ch.dmspoc.api.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/** Flattened, front-end friendly view of an Alfresco node (file or folder). */
public record NodeDto(
        String id,
        String name,
        boolean isFolder,
        boolean isFile,
        String nodeType,
        String mimeType,
        Long sizeInBytes,
        OffsetDateTime createdAt,
        OffsetDateTime modifiedAt,
        String createdByUser,
        List<String> aspectNames,
        Map<String, Object> properties,
        List<PathElement> ancestors, // root-first folder chain; only filled for search hits
        boolean hasAnnotations // a PDF with an annotated copy; set on listings so menus can offer it up front
) {

    public NodeDto withAnnotations(boolean annotated) {
        return new NodeDto(id, name, isFolder, isFile, nodeType, mimeType, sizeInBytes, createdAt, modifiedAt,
                createdByUser, aspectNames, properties, ancestors, annotated);
    }

    public record PathElement(String id, String name) {
    }
}
