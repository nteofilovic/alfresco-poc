package ch.dmspoc.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

/**
 * Merge one or more documents (PDF, Word, Excel, JPEG, PNG, TIFF...) into a
 * single PDF, in the given order, and store the result back in Alfresco.
 */
public record MergeRequest(
        @NotEmpty List<@NotBlank String> nodeIds,
        @NotBlank String targetParentId,
        @NotBlank String fileName
) {
}
