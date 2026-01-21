import * as fs from "fs";
import * as path from "path";
import { ProxyFormat, ProxyParseResult, RawProxy } from "./types";

export class ProxyParser {
  static async parseFile(filePath: string): Promise<ProxyParseResult> {
    const content = await fs.promises.readFile(filePath, "utf-8");
    return this.parseContent(content);
  }

  private static parseContent(content: string): Promise<ProxyParseResult> {
    const proxies: RawProxy[] = [];
    const errors: string[] = [];
    try {
      const lines = content.split("\n");
      console.log(`Parsing ${content} lines from proxy content`);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        console.log(`Parsing line ${i + 1}: ${line}`);
        // Skip empty lines and comments
        if (!line || line.startsWith("#") || line.startsWith("//")) {
          continue;
        }

        const proxy = this.parseInline(line);
        console.log(`Parsed proxy: ${JSON.stringify(proxy)}`);
        if (proxy) {
          proxies.push(proxy);
        } else {
          errors.push(`Invalid proxy at line ${i + 1}: ${line}`);
        }
      }
    } catch (error) {
      errors.push(`Failed to parse content: ${error}`);
    }

    return Promise.resolve({
      proxies,
      errors,
      format:ProxyFormat.TXT,
      total: proxies.length + errors.length,
      valid: proxies.length,
    });
  }
  
  private static parseInline(proxyString: string): RawProxy | null {
    let trimmed = proxyString.trim();
    console.log(`Parsing inline proxy string: ${trimmed}`);
    if (!trimmed) return null;

    // Remove trailing colons (common formatting issue)
    trimmed = trimmed.replace(/:+$/, '');

    try {
      // Try protocol://host:port:username:password format (some providers use this)
      const colonFormatMatch = trimmed.match(/^(https?|socks[45]):\/\/([^:]+):(\d+):([^:]+):(.+)$/);
      if (colonFormatMatch) {
        return {
          host: colonFormatMatch[2],
          port: parseInt(colonFormatMatch[3]),
          protocol: colonFormatMatch[1] as any,
          username: colonFormatMatch[4],
          password: colonFormatMatch[5],
        };
      }

      // Try URL format with protocol: protocol://user:pass@host:port
      if (trimmed.includes("://")) {
        try {
          const url = new URL(trimmed);
          const protocol = url.protocol.replace(":", "") as any;

          // Validate protocol
          if (!["http", "https", "socks4", "socks5"].includes(protocol)) {
            console.warn(`Invalid protocol "${protocol}" in proxy URL: ${trimmed}`);
            return null;
          }

          return {
            host: url.hostname,
            port: parseInt(url.port) || (protocol.includes('socks') ? 1080 : 8080),
            protocol: protocol,
            username: url.username || undefined,
            password: url.password || undefined,
          };
        } catch (urlError) {
          console.warn(`Invalid URL format: ${trimmed}`, urlError);
          // Fall through to try other formats
        }
      }

      // Try username:password@host:port format
      const authMatch = trimmed.match(/^([^:]+):([^@]+)@([^:]+):(\d+)$/);
      if (authMatch) {
        return {
          host: authMatch[3],
          port: parseInt(authMatch[4]),
          protocol: "http", // default
          username: authMatch[1],
          password: authMatch[2],
        };
      }

      // Try host:port format
      const basicMatch = trimmed.match(/^([^:]+):(\d+)$/);
      if (basicMatch) {
        return {
          host: basicMatch[1],
          port: parseInt(basicMatch[2]),
          protocol: "http", // default
        };
      }

      return null;
    } catch (e) {
      console.error(`Error parsing proxy string "${trimmed}":`, e);
      return null;
    }
  }
}
