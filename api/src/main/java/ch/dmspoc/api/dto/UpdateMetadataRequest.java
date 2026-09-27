package ch.dmspoc.api.dto;

import java.util.List;
import java.util.Map;

/**
 * Lets the front end apply a custom Alfresco aspect (a metadata "form",
 * e.g. one created with the Custom Model Manager) and its property values
 * to an existing node.
 */
public record UpdateMetadataRequest(
        List<String> aspectNames,
        Map<String, Object> properties
) {
}
