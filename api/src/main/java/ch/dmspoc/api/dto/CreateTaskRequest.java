package ch.dmspoc.api.dto;

import jakarta.validation.constraints.NotBlank;

import java.util.List;

/** Creates a task for {@code assignee}; {@code dueDate} is an ISO date (yyyy-MM-dd) or date-time and optional. */
public record CreateTaskRequest(
        @NotBlank String title,
        String description,
        String dueDate,
        @NotBlank String assignee,
        List<String> attachmentIds,
        String siteId // optional; derived from the first attachment when omitted
) {
}
