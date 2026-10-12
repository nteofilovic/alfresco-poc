package ch.dmspoc.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

import java.util.List;

/** One node of the admin-designed workspace folder tree. */
public record FolderNode(
        @NotBlank @Pattern(regexp = "[^\\\\/*?:\"<>|]+", message = "must not contain \\ / * ? : \" < > |") String name,
        @Valid List<@Valid FolderNode> children
) {
}
