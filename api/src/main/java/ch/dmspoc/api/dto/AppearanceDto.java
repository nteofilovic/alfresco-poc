package ch.dmspoc.api.dto;

/**
 * What the logged-in user's app should look like.
 *
 * @param style           the layout to render now: the user's own choice when allowed and set, otherwise the default
 * @param userStyle       the user's own choice, or null when they follow the application default
 * @param defaultStyle    the application default an administrator chose
 * @param allowUserChoice whether users may pick their own layout in their profile
 */
public record AppearanceDto(
        String style,
        String userStyle,
        String defaultStyle,
        boolean allowUserChoice
) {
}
