package ch.dmspoc.api.service;

import ch.dmspoc.api.dto.CreateSpaceRequest;
import ch.dmspoc.api.dto.SpaceDto;
import ch.dmspoc.api.dto.SpaceMemberDto;
import ch.dmspoc.api.exception.AlfrescoApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** Spaces are Share sites: listing, creation rules and member management; both Alfresco clients are mocked. */
class SpaceServiceTest {

    private final ObjectMapper mapper = JsonMapper.builder().build();
    private AlfrescoClient user;
    private AlfrescoClient service;
    private SpaceService spaces;

    @BeforeEach
    void setUp() {
        user = mock(AlfrescoClient.class);
        service = mock(AlfrescoClient.class);
        spaces = new SpaceService(user, service);
    }

    // ------------------------------------------------------------------- list

    @Test
    void membersSeeTheirSpacesWithTheirRoleUsingTheirOwnTicket() {
        when(user.listMySites(1000)).thenReturn(json("""
                {"list":{"entries":[{"entry":{"role":"SiteManager","site":
                  {"id":"clients","title":"Clients","description":"All clients","visibility":"PRIVATE"}}}]}}"""));
        library(user, "clients", "lib-1");

        List<SpaceDto> result = spaces.list(false);

        assertEquals(List.of(new SpaceDto("clients", "Clients", "All clients", "PRIVATE", "SiteManager", "lib-1")), result);
        verifyNoInteractions(service);
    }

    @Test
    void adminsSeeEverySpaceWithoutARole() {
        when(service.listSites(0, 1000)).thenReturn(json("""
                {"list":{"entries":[{"entry":{"id":"finance","title":"Finance","description":"","visibility":"PUBLIC"}}]}}"""));
        library(service, "finance", "lib-2");

        List<SpaceDto> result = spaces.list(true);

        assertEquals(1, result.size());
        assertNull(result.getFirst().role());
        assertEquals("lib-2", result.getFirst().rootId());
        verifyNoInteractions(user);
    }

    @Test
    void sitesWithoutADocumentLibraryAreSkipped() {
        when(service.listSites(0, 1000)).thenReturn(sites("a", "A", "b", "B"));
        library(service, "a", "lib-a");
        when(service.getSiteContainer("b", "documentLibrary")).thenThrow(new AlfrescoApiException(404, "none"));

        assertEquals(List.of("a"), spaces.list(true).stream().map(SpaceDto::id).toList());
    }

    @Test
    void sitesThatAreForbiddenAreSkipped() {
        when(user.listMySites(1000)).thenReturn(json("""
                {"list":{"entries":[{"entry":{"role":"SiteConsumer","site":{"id":"x","title":"X"}}}]}}"""));
        when(user.getSiteContainer("x", "documentLibrary")).thenThrow(new AlfrescoApiException(403, "no"));

        assertTrue(spaces.list(false).isEmpty());
    }

    @Test
    void aContainerWithoutAnIdCountsAsNoLibrary() {
        when(service.listSites(0, 1000)).thenReturn(sites("a", "A"));
        when(service.getSiteContainer("a", "documentLibrary")).thenReturn(json("{\"entry\":{}}"));

        assertTrue(spaces.list(true).isEmpty());
    }

    @Test
    void otherErrorsWhileLookingUpTheLibraryAreNotHidden() {
        when(service.listSites(0, 1000)).thenReturn(sites("a", "A"));
        when(service.getSiteContainer("a", "documentLibrary")).thenThrow(new AlfrescoApiException(500, "boom"));

        assertEquals(500, assertThrows(AlfrescoApiException.class, () -> spaces.list(true)).getStatus());
    }

    @Test
    void spacesAreSortedByTitleIgnoringCase() {
        when(service.listSites(0, 1000)).thenReturn(sites("c", "charlie", "a", "Alpha", "b", "bravo"));
        for (String id : List.of("a", "b", "c")) library(service, id, "lib-" + id);

        assertEquals(List.of("Alpha", "bravo", "charlie"), spaces.list(true).stream().map(SpaceDto::title).toList());
    }

    @Test
    void aMissingTitleFallsBackToTheIdAndMissingTextsToEmpty() {
        when(service.listSites(0, 1000)).thenReturn(json("{\"list\":{\"entries\":[{\"entry\":{\"id\":\"plain\"}}]}}"));
        library(service, "plain", "lib");

        SpaceDto space = spaces.list(true).getFirst();
        assertEquals("plain", space.title());
        assertEquals("", space.description());
        assertEquals("", space.visibility());
    }

    @Test
    void noSpacesGivesAnEmptyList() {
        when(user.listMySites(1000)).thenReturn(json("{\"list\":{\"entries\":[]}}"));

        assertTrue(spaces.list(false).isEmpty());
    }

    // ----------------------------------------------------------------- titles

    @Test
    void titlesMapSiteIdsToTitles() {
        when(service.listSites(0, 1000)).thenReturn(sites("a", "Alpha", "b", "Bravo"));

        assertEquals(Map.of("a", "Alpha", "b", "Bravo"), spaces.titles());
    }

    @Test
    void titlesOfNoSitesIsEmpty() {
        when(service.listSites(0, 1000)).thenReturn(json("{\"list\":{\"entries\":[]}}"));

        assertTrue(spaces.titles().isEmpty());
    }

    // ---------------------------------------------------------------- members

    @Test
    void membersCarryUsernameDisplayNameAndRole() {
        when(service.listSiteMembers("clients")).thenReturn(json("""
                {"list":{"entries":[
                  {"entry":{"id":"anna","role":"SiteManager","person":{"id":"anna","firstName":"Anna","lastName":"Meier"}}},
                  {"entry":{"id":"ben","role":"SiteConsumer","person":{"id":"ben","firstName":"Ben"}}}]}}"""));

        assertEquals(List.of(
                new SpaceMemberDto("anna", "Anna Meier", "SiteManager"),
                new SpaceMemberDto("ben", "Ben", "SiteConsumer")), spaces.members("clients"));
    }

    @Test
    void aMemberWithoutANameIsShownByUsername() {
        when(service.listSiteMembers("clients")).thenReturn(json("""
                {"list":{"entries":[{"entry":{"id":"ghost","role":"SiteConsumer","person":{"id":"ghost"}}}]}}"""));

        assertEquals("ghost", spaces.members("clients").getFirst().displayName());
    }

    @Test
    void theUsernameFallsBackToThePersonId() {
        when(service.listSiteMembers("clients")).thenReturn(json("""
                {"list":{"entries":[{"entry":{"role":"SiteConsumer","person":{"id":"zed","firstName":"Z"}}}]}}"""));

        assertEquals("zed", spaces.members("clients").getFirst().username());
    }

    @Test
    void aSpaceWithoutMembersHasAnEmptyList() {
        when(service.listSiteMembers("clients")).thenReturn(json("{\"list\":{\"entries\":[]}}"));

        assertTrue(spaces.members("clients").isEmpty());
    }

    // ----------------------------------------------------------------- create

    @Test
    void createDerivesTheIdFromTheTitleAndDefaultsToPrivate() {
        library(service, "clients-eu", "lib");

        SpaceDto space = spaces.create(new CreateSpaceRequest(null, "  Clients EU  ", null, null));

        assertEquals(new SpaceDto("clients-eu", "Clients EU", "", "PRIVATE", null, "lib"), space);
        verify(service).createSite("clients-eu", "Clients EU", null, "PRIVATE");
    }

    @Test
    void createUsesAnExplicitIdAndNormalizesTheVisibility() {
        library(service, "my-id", "lib");

        SpaceDto space = spaces.create(new CreateSpaceRequest("  my-id ", "Title", "About", " public "));

        assertEquals("my-id", space.id());
        assertEquals("PUBLIC", space.visibility());
        assertEquals("About", space.description());
        verify(service).createSite("my-id", "Title", "About", "PUBLIC");
    }

    @Test
    void aBlankIdOrVisibilityCountsAsMissing() {
        library(service, "title", "lib");

        SpaceDto space = spaces.create(new CreateSpaceRequest("   ", "Title", null, "  "));

        assertEquals("title", space.id());
        assertEquals("PRIVATE", space.visibility());
    }

    @Test
    void accentsAndSymbolsInTheTitleAreFoldedIntoTheId() {
        library(service, "cafe-resume", "lib");

        assertEquals("cafe-resume", spaces.create(new CreateSpaceRequest(null, "Café & Résumé!", null, null)).id());
    }

    @Test
    void accentedLettersLoseTheirMarks() {
        library(service, "zurich-uber-uns", "lib");

        assertEquals("zurich-uber-uns", spaces.create(new CreateSpaceRequest(null, "Zürich über uns", null, null)).id());
    }

    @Test
    void aTitleWithNothingUsableNeedsAnExplicitId() {
        var e = assertThrows(AlfrescoApiException.class, () -> spaces.create(new CreateSpaceRequest(null, "!!!", null, null)));

        assertEquals(400, e.getStatus());
        verifyNoInteractions(service);
    }

    @Test
    void anExplicitIdWithIllegalCharactersIsRefused() {
        for (String bad : List.of("with space", "under_score", "dot.dot", "ünï")) {
            var e = assertThrows(AlfrescoApiException.class, () -> spaces.create(new CreateSpaceRequest(bad, "Title", null, null)));
            assertEquals(400, e.getStatus(), bad);
        }
        verifyNoInteractions(service);
    }

    @Test
    void anUnknownVisibilityIsRefused() {
        var e = assertThrows(AlfrescoApiException.class, () -> spaces.create(new CreateSpaceRequest("ok", "Title", null, "SECRET")));

        assertEquals(400, e.getStatus());
        verifyNoInteractions(service);
    }

    @Test
    void aSpaceWithoutALibraryIsRolledBack() {
        when(service.getSiteContainer("broken", "documentLibrary")).thenThrow(new AlfrescoApiException(404, "none"));

        var e = assertThrows(AlfrescoApiException.class, () -> spaces.create(new CreateSpaceRequest("broken", "Broken", null, null)));

        assertEquals(502, e.getStatus());
        verify(service).deleteSite("broken");
    }

    @Test
    void aFailedRollbackDoesNotHideTheRealError() {
        when(service.getSiteContainer("broken", "documentLibrary")).thenThrow(new AlfrescoApiException(404, "none"));
        doThrow(new RuntimeException("cannot delete")).when(service).deleteSite("broken");

        var e = assertThrows(AlfrescoApiException.class, () -> spaces.create(new CreateSpaceRequest("broken", "Broken", null, null)));

        assertEquals(502, e.getStatus());
    }

    @Test
    void whenAlfrescoRefusesTheSiteNothingIsRolledBack() {
        when(service.createSite("dup", "Dup", null, "PRIVATE")).thenThrow(new AlfrescoApiException(409, "exists"));

        var e = assertThrows(AlfrescoApiException.class, () -> spaces.create(new CreateSpaceRequest("dup", "Dup", null, null)));

        assertEquals(409, e.getStatus());
        verify(service, never()).deleteSite(anyString());
    }

    @Test
    void deleteRemovesTheSite() {
        spaces.delete("clients");

        verify(service).deleteSite("clients");
    }

    // ---------------------------------------------------------------- members

    @Test
    void addMemberAddsWithTheGivenRole() {
        spaces.addMember("clients", "anna", "SiteCollaborator");

        verify(service).addSiteMember("clients", "anna", "SiteCollaborator");
        verify(service, never()).updateSiteMember(anyString(), anyString(), anyString());
    }

    @Test
    void addMemberAcceptsEveryKnownRole() {
        for (String role : List.of("SiteManager", "SiteCollaborator", "SiteContributor", "SiteConsumer")) {
            spaces.addMember("clients", "anna", role);
            verify(service).addSiteMember("clients", "anna", role);
        }
    }

    @Test
    void anExistingMemberGetsTheNewRoleInstead() {
        when(service.addSiteMember("clients", "anna", "SiteConsumer")).thenThrow(new AlfrescoApiException(409, "member"));

        spaces.addMember("clients", "anna", "SiteConsumer");

        verify(service).updateSiteMember("clients", "anna", "SiteConsumer");
    }

    @Test
    void otherErrorsWhileAddingAMemberArePassedOn() {
        when(service.addSiteMember("clients", "ghost", "SiteConsumer")).thenThrow(new AlfrescoApiException(404, "no user"));

        var e = assertThrows(AlfrescoApiException.class, () -> spaces.addMember("clients", "ghost", "SiteConsumer"));

        assertEquals(404, e.getStatus());
        verify(service, never()).updateSiteMember(anyString(), anyString(), anyString());
    }

    @Test
    void anUnknownRoleIsRefusedBeforeAlfrescoIsCalled() {
        for (String role : new String[]{"Admin", "sitemanager", ""}) {
            var e = assertThrows(AlfrescoApiException.class, () -> spaces.addMember("clients", "anna", role));
            assertEquals(400, e.getStatus());
        }
        verifyNoInteractions(service);
    }

    @Test
    void removeMemberRemovesThem() {
        spaces.removeMember("clients", "anna");

        verify(service).removeSiteMember("clients", "anna");
    }

    // ---------------------------------------------------------------- helpers

    private void library(AlfrescoClient client, String siteId, String libraryId) {
        when(client.getSiteContainer(siteId, "documentLibrary")).thenReturn(json("{\"entry\":{\"id\":\"" + libraryId + "\"}}"));
        // createSite is a plain mock call; no stubbing needed for the happy path
        when(client.createSite(anyString(), anyString(), any(), anyString())).thenReturn(json("{}"));
    }

    private JsonNode sites(String... idTitlePairs) {
        StringBuilder entries = new StringBuilder();
        for (int i = 0; i < idTitlePairs.length; i += 2) {
            if (i > 0) entries.append(',');
            entries.append("{\"entry\":{\"id\":\"").append(idTitlePairs[i]).append("\",\"title\":\"")
                    .append(idTitlePairs[i + 1]).append("\"}}");
        }
        return json("{\"list\":{\"entries\":[" + entries + "]}}");
    }

    private JsonNode json(String s) {
        return mapper.readTree(s);
    }
}
