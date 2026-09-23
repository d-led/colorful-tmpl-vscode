public class Sample {
    static String tmpl = """
        {{- if .ShowGreeting }}
        Hello {{ .Name }}
        {{- end }}
        """;

    public static void main(String[] args) {}
}
