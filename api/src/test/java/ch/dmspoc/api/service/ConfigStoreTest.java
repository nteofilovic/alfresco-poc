package ch.dmspoc.api.service;

import ch.dmspoc.api.exception.AlfrescoApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Folder lookup, caching and retry rules of the config store; Alfresco is mocked. */
class ConfigStoreTest {

    private final ObjectMapper mapper = JsonMapper.builder().build();
    private AlfrescoClient client;
    private ConfigStore store;

    @BeforeEach
    void setUp() {
        client = mock(AlfrescoClient.class);
        store = new ConfigStore(client);
    }

    // ------------------------------------------------------------------- read

    @Test
    void readIsEmptyWhenTheConfigFolderDoesNotExist() {
        when(client.findByRelativePath("-root-", "zapis-config")).thenReturn(null);

        assertEquals(Optional.empty(), store.read("a.json"));
        verify(client, never()).createFolder(anyString(), anyString());
        verify(client, never()).getContent(anyString());
    }

    @Test
    void readIsEmptyWhenTheFileDoesNotExist() {
        configFolder();
        when(client.findByRelativePath("cfg", "a.json")).thenReturn(null);

        assertEquals(Optional.empty(), store.read("a.json"));
    }

    @Test
    void readIsEmptyWhenTheNameIsAFolderNotAFile() {
        configFolder();
        when(client.findByRelativePath("cfg", "a.json")).thenReturn(json("{\"id\":\"x\",\"isFolder\":true}"));

        assertEquals(Optional.empty(), store.read("a.json"));
        verify(client, never()).getContent(anyString());
    }

    @Test
    void readIsEmptyWhenTheFileHasNoContent() {
        file("a.json", "f1");
        when(client.getContent("f1")).thenReturn(new byte[0]);
        assertEquals(Optional.empty(), store.read("a.json"));

        when(client.getContent("f1")).thenReturn(null);
        assertEquals(Optional.empty(), store.read("a.json"));
    }

    @Test
    void readReturnsTheContent() {
        file("a.json", "f1");
        when(client.getContent("f1")).thenReturn("{}".getBytes());

        assertArrayEquals("{}".getBytes(), store.read("a.json").orElseThrow());
    }

    @Test
    void readInASubFolderResolvesTheSubFolderBelowTheConfigFolder() {
        configFolder();
        when(client.findByRelativePath("cfg", "annotations")).thenReturn(json("{\"id\":\"sub\",\"isFolder\":true}"));
        when(client.findByRelativePath("sub", "n1.json")).thenReturn(json("{\"id\":\"f9\",\"isFile\":true}"));
        when(client.getContent("f9")).thenReturn("x".getBytes());

        assertArrayEquals("x".getBytes(), store.read("annotations", "n1.json").orElseThrow());
    }

    @Test
    void readIsEmptyWhenTheSubFolderDoesNotExist() {
        configFolder();
        when(client.findByRelativePath("cfg", "annotations")).thenReturn(null);

        assertEquals(Optional.empty(), store.read("annotations", "n1.json"));
        verify(client, never()).createFolder(anyString(), anyString());
    }

    @Test
    void folderIdsAreLookedUpOnlyOnce() {
        file("a.json", "f1");
        when(client.getContent("f1")).thenReturn("x".getBytes());

        store.read("a.json");
        store.read("a.json");

        verify(client, times(1)).findByRelativePath("-root-", "zapis-config");
        verify(client, times(2)).findByRelativePath("cfg", "a.json");
    }

    // ------------------------------------------------------------------ write

    @Test
    void writeCreatesTheConfigFolderOnFirstUse() {
        when(client.findByRelativePath("-root-", "zapis-config")).thenReturn(null);
        when(client.createFolder("-root-", "zapis-config")).thenReturn(json("{\"entry\":{\"id\":\"cfg\"}}"));

        store.write("a.json", "{}".getBytes());

        verify(client).uploadFile("cfg", "a.json", "{}".getBytes(), "application/json", true);
    }

    @Test
    void writeDoesNotRecreateAnExistingFolder() {
        configFolder();

        store.write("a.json", "{}".getBytes());

        verify(client, never()).createFolder(anyString(), anyString());
        verify(client).uploadFile("cfg", "a.json", "{}".getBytes(), "application/json", true);
    }

    @Test
    void writeTreatsAFileWithTheFolderNameAsMissingAndCreatesTheFolder() {
        when(client.findByRelativePath("-root-", "zapis-config")).thenReturn(json("{\"id\":\"odd\",\"isFile\":true}"));
        when(client.createFolder("-root-", "zapis-config")).thenReturn(json("{\"entry\":{\"id\":\"cfg\"}}"));

        store.write("a.json", "{}".getBytes());

        verify(client).uploadFile(eq("cfg"), eq("a.json"), any(), anyString(), anyBoolean());
    }

    @Test
    void writeCreatesTheSubFolderToo() {
        configFolder();
        when(client.findByRelativePath("cfg", "annotations")).thenReturn(null);
        when(client.createFolder("cfg", "annotations")).thenReturn(json("{\"entry\":{\"id\":\"sub\"}}"));

        store.write("annotations", "n1.pdf", "pdf".getBytes(), "application/pdf");

        verify(client).uploadFile("sub", "n1.pdf", "pdf".getBytes(), "application/pdf", true);
    }

    // ------------------------------------------------------------------ retry

    @Test
    void aStaleCachedFolderIdIsForgottenAndTheCallRetriedOnce() {
        file("a.json", "f1");
        when(client.getContent("f1"))
                .thenReturn("first".getBytes())
                .thenThrow(new AlfrescoApiException(404, "folder deleted"))
                .thenReturn("again".getBytes());
        store.read("a.json"); // fills the folder cache

        assertArrayEquals("again".getBytes(), store.read("a.json").orElseThrow());
        verify(client, times(2)).findByRelativePath("-root-", "zapis-config"); // looked up again after the 404
    }

    @Test
    void aSecondNotFoundAfterTheRetryIsPassedOn() {
        file("a.json", "f1");
        when(client.getContent("f1")).thenReturn("x".getBytes());
        store.read("a.json");
        when(client.getContent("f1")).thenThrow(new AlfrescoApiException(404, "gone"));

        var e = assertThrows(AlfrescoApiException.class, () -> store.read("a.json"));
        assertEquals(404, e.getStatus());
        verify(client, times(3)).getContent("f1"); // the first read, then the failing call and its one retry
    }

    @Test
    void notFoundWithNothingCachedIsNotRetried() {
        when(client.findByRelativePath("-root-", "zapis-config")).thenThrow(new AlfrescoApiException(404, "x"));

        assertThrows(AlfrescoApiException.class, () -> store.read("a.json"));
        verify(client, times(1)).findByRelativePath("-root-", "zapis-config");
    }

    @Test
    void otherErrorsAreNotRetried() {
        file("a.json", "f1");
        when(client.getContent("f1")).thenThrow(new AlfrescoApiException(500, "boom"));

        var e = assertThrows(AlfrescoApiException.class, () -> store.read("a.json"));
        assertEquals(500, e.getStatus());
        verify(client, times(1)).getContent("f1");
    }

    @Test
    void writeIsRetriedAfterAStaleFolderToo() {
        configFolder();
        when(client.uploadFile(anyString(), anyString(), any(), anyString(), anyBoolean()))
                .thenReturn(json("{}"))
                .thenThrow(new AlfrescoApiException(404, "gone"))
                .thenReturn(json("{}"));
        store.write("a.json", "1".getBytes());

        store.write("a.json", "2".getBytes());

        verify(client, times(3)).uploadFile(eq("cfg"), eq("a.json"), any(), anyString(), eq(true));
    }

    // -------------------------------------------------------------- listNames

    @Test
    void listNamesIsEmptyWhenTheFolderDoesNotExist() {
        when(client.findByRelativePath("-root-", "zapis-config")).thenReturn(null);

        assertTrue(store.listNames(null).isEmpty());
        verify(client, never()).listChildren(anyString(), anyString(), anyInt(), anyInt());
    }

    @Test
    void listNamesIsEmptyWhenTheSubFolderDoesNotExist() {
        configFolder();
        when(client.findByRelativePath("cfg", "annotations")).thenReturn(null);

        assertTrue(store.listNames("annotations").isEmpty());
    }

    @Test
    void listNamesReturnsTheNamesOfOnePage() {
        configFolder();
        when(client.listChildren("cfg", "(isFile=true)", 0, 1000)).thenReturn(page(false, "a.json", "b.json"));

        assertEquals(Set.of("a.json", "b.json"), store.listNames(null));
    }

    @Test
    void listNamesFollowsThePagination() {
        configFolder();
        when(client.listChildren("cfg", "(isFile=true)", 0, 1000)).thenReturn(page(true, "a.json"));
        when(client.listChildren("cfg", "(isFile=true)", 1000, 1000)).thenReturn(page(false, "b.json"));

        assertEquals(Set.of("a.json", "b.json"), store.listNames(null));
    }

    @Test
    void listNamesOfAnEmptyFolderIsEmpty() {
        configFolder();
        when(client.listChildren("cfg", "(isFile=true)", 0, 1000)).thenReturn(page(false));

        assertTrue(store.listNames(null).isEmpty());
    }

    // ----------------------------------------------------------------- delete

    @Test
    void deleteRemovesAnExistingFilePermanently() {
        file("a.json", "f1");

        store.delete(null, "a.json");

        verify(client).deleteNode("f1", true);
    }

    @Test
    void deleteDoesNothingWhenTheFileIsMissing() {
        configFolder();
        when(client.findByRelativePath("cfg", "a.json")).thenReturn(null);

        store.delete(null, "a.json");

        verify(client, never()).deleteNode(anyString(), anyBoolean());
    }

    @Test
    void deleteDoesNothingWhenTheFolderIsMissing() {
        when(client.findByRelativePath("-root-", "zapis-config")).thenReturn(null);

        store.delete(null, "a.json");

        verify(client, never()).deleteNode(anyString(), anyBoolean());
    }

    // ---------------------------------------------------------------- helpers

    private void configFolder() {
        when(client.findByRelativePath("-root-", "zapis-config")).thenReturn(json("{\"id\":\"cfg\",\"isFolder\":true}"));
    }

    private void file(String name, String id) {
        configFolder();
        when(client.findByRelativePath("cfg", name)).thenReturn(json("{\"id\":\"" + id + "\",\"isFile\":true}"));
    }

    private JsonNode page(boolean hasMore, String... names) {
        StringBuilder entries = new StringBuilder();
        for (String name : names) {
            if (!entries.isEmpty()) entries.append(',');
            entries.append("{\"entry\":{\"name\":\"").append(name).append("\"}}");
        }
        return json("{\"list\":{\"entries\":[" + entries + "],\"pagination\":{\"hasMoreItems\":" + hasMore + "}}}");
    }

    private JsonNode json(String s) {
        return mapper.readTree(s);
    }
}
