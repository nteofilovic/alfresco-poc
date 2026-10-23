package ch.dmspoc.api.service;

import ch.dmspoc.api.dto.AppearanceDto;
import ch.dmspoc.api.dto.AppearanceSettings;
import ch.dmspoc.api.exception.AlfrescoApiException;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * App styles (layouts of the whole web app). An administrator picks the default and whether users may choose their
 * own; each user's choice is kept by username. Everything lives in one JSON document,
 * {@code Company Home/zapis-config/appearance.json}, read and written through {@link ConfigStore}.
 */
@Service
public class AppearanceService {

    public static final String THREE_PANE = "three-pane";
    public static final String COMMAND_BAR = "command-bar";
    /** The layouts the web app knows; the first one is the default until an administrator changes it. */
    public static final List<String> STYLES = List.of(THREE_PANE, COMMAND_BAR);

    private static final String CONFIG_FILE = "appearance.json";

    /** The stored document. {@code userStyles} maps username to that user's own style. */
    record Config(String defaultStyle, Boolean allowUserChoice, Map<String, String> userStyles) {
    }

    private final ConfigStore store;
    private final ObjectMapper mapper;

    public AppearanceService(ConfigStore store, ObjectMapper mapper) {
        this.store = store;
        this.mapper = mapper;
    }

    /** The effective appearance for {@code username}. */
    public synchronized AppearanceDto forUser(String username) {
        return toDto(read(), username);
    }

    /** Sets (or with null/blank clears) the user's own style; refused when users may not choose. */
    public synchronized AppearanceDto setUserStyle(String username, String style) {
        Config config = read();
        if (!config.allowUserChoice()) {
            throw new AlfrescoApiException(403, "The layout is set by your administrator");
        }
        Map<String, String> userStyles = new TreeMap<>(config.userStyles());
        if (style == null || style.isBlank()) {
            userStyles.remove(username);
        } else {
            userStyles.put(username, validated(style));
        }
        Config updated = new Config(config.defaultStyle(), true, userStyles);
        write(updated);
        return toDto(updated, username);
    }

    public synchronized AppearanceSettings settings() {
        Config config = read();
        return new AppearanceSettings(config.defaultStyle(), config.allowUserChoice());
    }

    /** Admin: changes the default and the user-choice switch. Users' own choices are kept for when choice is allowed again. */
    public synchronized AppearanceSettings updateSettings(AppearanceSettings settings) {
        Config config = read();
        Config updated = new Config(validated(settings.defaultStyle()), settings.allowUserChoice(), config.userStyles());
        write(updated);
        return new AppearanceSettings(updated.defaultStyle(), updated.allowUserChoice());
    }

    // ---------------------------------------------------------------- helpers

    private static AppearanceDto toDto(Config config, String username) {
        String own = config.userStyles().get(username);
        String effective = config.allowUserChoice() && own != null ? own : config.defaultStyle();
        return new AppearanceDto(effective, own, config.defaultStyle(), config.allowUserChoice());
    }

    private static String validated(String style) {
        String s = style.trim();
        if (!STYLES.contains(s)) throw new AlfrescoApiException(400, "Unknown app style: " + s);
        return s;
    }

    /** The stored config with defaults filled in; styles the app no longer knows are dropped. */
    private Config read() {
        Config raw = store.read(CONFIG_FILE).map(content -> mapper.readValue(content, Config.class)).orElse(null);
        String defaultStyle = raw != null && raw.defaultStyle() != null && STYLES.contains(raw.defaultStyle())
                ? raw.defaultStyle() : STYLES.getFirst();
        boolean allow = raw == null || raw.allowUserChoice() == null || raw.allowUserChoice();
        Map<String, String> userStyles = new TreeMap<>();
        if (raw != null && raw.userStyles() != null) {
            raw.userStyles().forEach((user, style) -> {
                if (style != null && STYLES.contains(style)) userStyles.put(user, style);
            });
        }
        return new Config(defaultStyle, allow, userStyles);
    }

    private void write(Config config) {
        store.write(CONFIG_FILE, mapper.writeValueAsBytes(config));
    }
}
