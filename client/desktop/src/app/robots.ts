import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const origin = siteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/pet", "/pocket"],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
