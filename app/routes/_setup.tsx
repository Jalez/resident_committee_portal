/**
 * Setup route - shows configuration status
 * Accessible even when database isn't configured
 */

import { useLoaderData } from "react-router";
import { getEnvStatus, type EnvStatus } from "~/lib/env-config.server";
import { SetupGuide } from "~/components/setup-guide";

export async function loader() {
    // This loader doesn't require database access
    const envStatus = getEnvStatus();

    return {
        envStatus,
    };
}

export function meta() {
    return [
        { title: "Setup Guide | Portal" },
        { name: "description", content: "Configure your environment to get started" },
    ];
}

export default function SetupPage() {
    const { envStatus } = useLoaderData<{ envStatus: EnvStatus }>();

    return <SetupGuide envStatus={envStatus} />;
}
