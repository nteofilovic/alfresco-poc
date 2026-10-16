package ch.dmspoc.api.dto;

import java.util.List;

/** One page of a folder listing, with the paging info Alfresco reported. */
public record NodePage(List<NodeDto> items, int totalItems, int skip, int maxItems, boolean hasMore) {
}
