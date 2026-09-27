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
        Map<String, Object> properties
) {
}
