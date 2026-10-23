import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Prints the JaCoCo coverage totals and the least-covered classes during the build. Run by the exec plugin
 * right after the report goal: {@code java tools/CoverageSummary.java [path/to/jacoco.csv]}.
 */
public class CoverageSummary {

    private record Row(String name, long[] counters) {
        // counters: instruction, branch, line, method (missed, covered pairs)
        double ratio(int i) {
            long total = counters[2 * i] + counters[2 * i + 1];
            return total == 0 ? 1.0 : (double) counters[2 * i + 1] / total;
        }

        long lines() {
            return counters[4] + counters[5];
        }
    }

    public static void main(String[] args) throws IOException {
        Path csv = Path.of(args.length > 0 ? args[0] : "target/site/jacoco/jacoco.csv");
        if (!Files.exists(csv)) {
            System.out.println("[coverage] No JaCoCo report found at " + csv + " (tests skipped?)");
            return;
        }
        List<String> lines = Files.readAllLines(csv);
        long[] total = new long[8];
        List<Row> rows = new ArrayList<>();
        for (String line : lines.subList(1, lines.size())) {
            String[] c = line.split(",");
            long[] counters = {n(c[3]), n(c[4]), n(c[5]), n(c[6]), n(c[7]), n(c[8]), n(c[11]), n(c[12])};
            for (int i = 0; i < 8; i++) total[i] += counters[i];
            rows.add(new Row(c[1].replaceFirst("^ch\\.dmspoc\\.api\\.", "") + "." + c[2], counters));
        }
        Row all = new Row("TOTAL", total);

        System.out.println();
        System.out.println("[coverage] -------------------------------------------------------------");
        System.out.printf("[coverage] Test coverage: lines %s (%d/%d)   branches %s   instructions %s   methods %s%n",
                pct(all.ratio(2)), total[5], total[4] + total[5], pct(all.ratio(1)), pct(all.ratio(0)), pct(all.ratio(3)));
        System.out.println("[coverage] Least covered classes (by lines):");
        rows.stream()
                .filter(r -> r.lines() > 0 && r.ratio(2) < 1.0)
                .sorted((a, b) -> Double.compare(a.ratio(2), b.ratio(2)))
                .limit(8)
                .forEach(r -> System.out.printf("[coverage]   %6s  %s (%d lines)%n", pct(r.ratio(2)), r.name(), r.lines()));
        System.out.println("[coverage] HTML report: " + csv.getParent().resolve("index.html").toAbsolutePath());
        System.out.println("[coverage] -------------------------------------------------------------");
    }

    private static long n(String s) {
        return Long.parseLong(s.trim());
    }

    private static String pct(double ratio) {
        return String.format("%.1f%%", ratio * 100);
    }
}
