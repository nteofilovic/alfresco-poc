package ch.dmspoc.api.service;

import ch.dmspoc.api.dto.AppearanceDto;
import ch.dmspoc.api.dto.AppearanceSettings;
import ch.dmspoc.api.exception.AlfrescoApiException;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AppearanceServiceTest {

    /** Keeps config files in memory instead of Alfresco. */
    static class InMemoryStore extends ConfigStore {
        final Map<String, byte[]> files = new HashMap<>();

        InMemoryStore() {
            super(null);
        }

        @Override
        public Optional<byte[]> read(String fileName) {
            return Optional.ofNullable(files.get(fileName));
        }

        @Override
        public void write(String fileName, byte[] json) {
            files.put(fileName, json);
        }
    }

    private final InMemoryStore store = new InMemoryStore();
    private final AppearanceService service = new AppearanceService(store, new ObjectMapper());

    @Test
    void defaultsToThreePaneWithUserChoiceWhenNothingIsStored() {
        AppearanceDto dto = service.forUser("anna");
        assertEquals(AppearanceService.THREE_PANE, dto.style());
        assertNull(dto.userStyle());
        assertEquals(AppearanceService.THREE_PANE, dto.defaultStyle());
        assertTrue(dto.allowUserChoice());
    }

    @Test
    void userChoiceAppliesOnlyToThatUser() {
        service.setUserStyle("anna", AppearanceService.COMMAND_BAR);
        assertEquals(AppearanceService.COMMAND_BAR, service.forUser("anna").style());
        assertEquals(AppearanceService.COMMAND_BAR, service.forUser("anna").userStyle());
        assertEquals(AppearanceService.THREE_PANE, service.forUser("ben").style());
    }

    @Test
    void clearingTheChoiceFallsBackToTheDefault() {
        service.setUserStyle("anna", AppearanceService.COMMAND_BAR);
        AppearanceDto dto = service.setUserStyle("anna", null);
        assertNull(dto.userStyle());
        assertEquals(AppearanceService.THREE_PANE, dto.style());
    }

    @Test
    void adminDefaultAppliesToUsersWithoutTheirOwnChoice() {
        service.setUserStyle("anna", AppearanceService.THREE_PANE);
        service.updateSettings(new AppearanceSettings(AppearanceService.COMMAND_BAR, true));
        assertEquals(AppearanceService.COMMAND_BAR, service.forUser("ben").style());
        assertEquals(AppearanceService.THREE_PANE, service.forUser("anna").style());
    }

    @Test
    void lockingTheChoiceOverridesUsersButKeepsTheirPreference() {
        service.setUserStyle("anna", AppearanceService.COMMAND_BAR);
        service.updateSettings(new AppearanceSettings(AppearanceService.THREE_PANE, false));

        AppearanceDto locked = service.forUser("anna");
        assertEquals(AppearanceService.THREE_PANE, locked.style());
        assertFalse(locked.allowUserChoice());

        service.updateSettings(new AppearanceSettings(AppearanceService.THREE_PANE, true));
        assertEquals(AppearanceService.COMMAND_BAR, service.forUser("anna").style());
    }

    @Test
    void usersCannotChooseWhileLocked() {
        service.updateSettings(new AppearanceSettings(AppearanceService.THREE_PANE, false));
        AlfrescoApiException e = assertThrows(AlfrescoApiException.class,
                () -> service.setUserStyle("anna", AppearanceService.COMMAND_BAR));
        assertEquals(403, e.getStatus());
    }

    @Test
    void unknownStylesAreRejected() {
        assertEquals(400, assertThrows(AlfrescoApiException.class, () -> service.setUserStyle("anna", "sidebar")).getStatus());
        assertEquals(400, assertThrows(AlfrescoApiException.class,
                () -> service.updateSettings(new AppearanceSettings("sidebar", true))).getStatus());
    }

    @Test
    void storedStylesTheAppNoLongerKnowsAreIgnored() {
        store.files.put("appearance.json", """
                {"defaultStyle":"retired","allowUserChoice":true,"userStyles":{"anna":"retired","ben":"command-bar"}}
                """.getBytes(StandardCharsets.UTF_8));
        assertEquals(AppearanceService.THREE_PANE, service.forUser("anna").style());
        assertNull(service.forUser("anna").userStyle());
        assertEquals(AppearanceService.COMMAND_BAR, service.forUser("ben").style());
    }

    @Test
    void settingsSurviveAReload() {
        service.updateSettings(new AppearanceSettings(AppearanceService.COMMAND_BAR, false));
        AppearanceService reloaded = new AppearanceService(store, new ObjectMapper());
        assertEquals(new AppearanceSettings(AppearanceService.COMMAND_BAR, false), reloaded.settings());
    }
}
