package ch.dmspoc.api.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * A sticky-note comment to add to a PDF. {@code x}/{@code y} are fractions (0..1) of the page as displayed,
 * measured from its top-left corner, so the client needs no knowledge of the PDF's own coordinate system.
 * {@code color} is an optional {@code #rrggbb} icon colour (yellow when absent).
 */
public record StickyNote(
        @Min(1) int page,
        @Min(0) @Max(1) double x,
        @Min(0) @Max(1) double y,
        @NotBlank @Size(max = 5000) String text,
        @Pattern(regexp = "#[0-9a-fA-F]{6}") String color) {
}
