package ch.dmspoc.api.dto;

import jakarta.validation.constraints.NotBlank;

public record CreateFolderRequest(@NotBlank String name) {
}
