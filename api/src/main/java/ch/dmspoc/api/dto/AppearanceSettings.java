package ch.dmspoc.api.dto;

import jakarta.validation.constraints.NotBlank;

/** Application-wide appearance an administrator sets: the default layout and whether users may choose their own. */
public record AppearanceSettings(
        @NotBlank String defaultStyle,
        boolean allowUserChoice
) {
}
