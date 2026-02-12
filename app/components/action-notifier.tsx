import { useEffect } from "react";
import { useActionData, useSearchParams } from "react-router";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export function ActionNotifier() {
    const { t } = useTranslation();
    const [searchParams, setSearchParams] = useSearchParams();
    const actionData = useActionData() as any;

    useEffect(() => {
        // Handle URL success parameter
        const success = searchParams.get("success");
        if (success) {
            const message = t(`common.success.${success}`, {
                defaultValue: t("common.success.generic", "Operation successful"),
            });
            toast.success(message);

            // Clean up the URL parameter
            const newParams = new URLSearchParams(searchParams);
            newParams.delete("success");
            setSearchParams(newParams, { replace: true });
        }

        // Handle URL error parameter
        const errorParam = searchParams.get("error");
        if (errorParam) {
            const message = t(`common.error.${errorParam}`, {
                defaultValue: t("common.error.generic", "An error occurred"),
            });
            toast.error(message);

            // Clean up the URL parameter
            const newParams = new URLSearchParams(searchParams);
            newParams.delete("error");
            setSearchParams(newParams, { replace: true });
        }
    }, [searchParams, setSearchParams, t]);

    useEffect(() => {
        // Handle actionData error
        if (actionData?.error) {
            const message = t(actionData.error, {
                defaultValue: actionData.error,
            });
            toast.error(message);
        }

        // Handle actionData fieldErrors (optional, usually handled by form)
        if (actionData?.fieldErrors) {
            toast.error(t("common.error.validation_failed"));
        }
    }, [actionData, t]);

    return null;
}
