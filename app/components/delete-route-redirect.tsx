import { useEffect } from "react";
import { useNavigate } from "react-router";

interface DeleteRouteRedirectProps {
	listPath: string;
}

export function DeleteRouteRedirect({ listPath }: DeleteRouteRedirectProps) {
	const navigate = useNavigate();

	useEffect(() => {
		navigate(listPath, { replace: true });
	}, [navigate, listPath]);

	return null;
}
