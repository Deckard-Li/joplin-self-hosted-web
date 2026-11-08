#!/bin/sh
set -eu

usage() {
	printf '%s\n' 'Usage: sh tools/deploy.sh lan|public HOST JOPLIN_SERVER_URL [HTTPS_PORT]' 'Uninstall: sh tools/deploy.sh uninstall --confirm' 'HOST must be a DNS hostname or IPv4 address, without a scheme or port.' 'LAN HTTPS defaults to 8443; public HTTPS uses ports 80 and 443.'
}

if [ "${1:-}" = uninstall ]; then
	if [ "$#" -ne 2 ] || [ "$2" != --confirm ]; then
		printf '%s\n' 'Uninstall permanently deletes this Compose project, its CA/config volumes, local web image, .env, .env.deploy, and exported root certificate.' 'First remove the imported LAN root and site data from every client. Your existing Joplin Server is not deleted.' >&2
		usage >&2
		exit 1
	fi
	cd "$(dirname "$0")/.."
	docker compose version >/dev/null
	docker info >/dev/null
	env_file=.env.deploy
	if [ ! -f "$env_file" ]; then
		env_file=.env
	fi
	if [ ! -f "$env_file" ]; then
		env_file=/dev/null
	fi
	export JOPLIN_SERVER_URL=http://127.0.0.1:22300
	docker compose --env-file "$env_file" --profile https --profile lan-https down --volumes --rmi local --remove-orphans
	rm -f .env .env.deploy joplin-web-lan-root.crt
	printf '%s\n' 'Deployment removed. The CA private key and Caddy configuration volumes have been deleted.' 'Also remove client certificate trust, browser site data/service workers, transferred certificate copies, and the repository folder if no longer needed.' 'Shared Docker base images/build cache and your separate Joplin Server are deliberately untouched.'
	exit 0
fi

if [ "$#" -lt 3 ] || [ "$#" -gt 4 ]; then
	usage >&2
	exit 1
fi

mode=$1
host=$2
backend=$3
port=${4:-8443}
case "$mode" in
	lan) profile=lan-https; service=https-lan ;;
	public) profile=https; service=https; port=${4:-443} ;;
	*) usage >&2; exit 1 ;;
esac
case "$host" in
	''|*[!a-zA-Z0-9.-]*|-*|.*|*.) printf '%s\n' 'Invalid HOST: use a DNS hostname or IPv4 address.' >&2; exit 1 ;;
esac
case "$backend" in
	http://?*|https://?*) ;;
	*) printf '%s\n' 'JOPLIN_SERVER_URL must start with http:// or https://.' >&2; exit 1 ;;
esac
case "$backend" in
	*[!a-zA-Z0-9:/._%\[\]-]*) printf '%s\n' 'Use a backend URL without credentials, query strings, fragments, spaces, or shell substitutions.' >&2; exit 1 ;;
esac
case "$port" in
	''|*[!0-9]*) printf '%s\n' 'HTTPS_PORT must be a number between 1 and 65535.' >&2; exit 1 ;;
esac
if [ "${#port}" -gt 5 ] || [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
	printf '%s\n' 'HTTPS_PORT must be between 1 and 65535.' >&2
	exit 1
fi
if [ "$mode" = public ] && [ "$port" -ne 443 ]; then
	printf '%s\n' 'Public HTTPS requires port 443; omit HTTPS_PORT.' >&2
	exit 1
fi

cd "$(dirname "$0")/.."
docker compose version >/dev/null
docker info >/dev/null
export JOPLIN_SERVER_URL="$backend" WEB_DOMAIN="$host" LAN_HTTPS_PORT="$port" WEB_BIND=127.0.0.1 WEB_PORT="${WEB_PORT:-8080}"
umask 077
printf 'JOPLIN_SERVER_URL=%s\nWEB_DOMAIN=%s\nLAN_HTTPS_PORT=%s\nWEB_BIND=%s\nWEB_PORT=%s\n' "$JOPLIN_SERVER_URL" "$WEB_DOMAIN" "$LAN_HTTPS_PORT" "$WEB_BIND" "$WEB_PORT" > .env.deploy

compose() {
	docker compose --env-file .env.deploy "$@"
}

compose --profile https --profile lan-https stop https https-lan
compose --profile "$profile" up --build -d --wait --wait-timeout 180 --force-recreate web "$service"

if [ "$mode" = lan ]; then
	compose --profile "$profile" cp https-lan:/data/caddy/pki/authorities/local/root.crt ./joplin-web-lan-root.crt
	chmod 644 ./joplin-web-lan-root.crt
	url="https://$host:$port"
	printf '\n%s\n' 'LAN root exported to joplin-web-lan-root.crt. Transfer ONLY this public certificate securely to each client.' 'One-time Windows client trust: certutil -user -addstore Root .\joplin-web-lan-root.crt' 'On Linux clients, install it in the OS trusted root store; browsers with separate stores need their own import.' 'Never bypass certificate warnings. Preserve the caddy_data volume to preserve client trust.'
else
	url="https://$host"
fi
printf '\nWeb app: %s/\nJoplin Server sync URL: %s/joplin\n' "$url" "$url"
printf '%s\n' 'Deployment settings are saved in .env.deploy; rerun this same command to update or reinstall.'