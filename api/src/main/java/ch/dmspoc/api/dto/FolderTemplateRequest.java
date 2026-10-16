package ch.dmspoc.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

import java.util.List;

/** Create or replace a folder template. {@code folders} are the subfolders created inside every instance. */
public record FolderTemplateRequest(
        @NotBlank @Pattern(regexp = "[^\\\\/*?:\"<>|]+", message = "must not contain \\ / * ? : \" < > |") String name,
        String description,
        @Valid List<@Valid FolderNode> folders
) {
}
