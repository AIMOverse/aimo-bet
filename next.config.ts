import { withWorkflow } from "workflow/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cygekzzmwtcvideneifq.supabase.co",
        port: "",
        pathname: "/**",
        search: "",
      },
    ],
  },
};

export default withWorkflow(nextConfig);
