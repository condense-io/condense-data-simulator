# docker buildx build --platform linux/amd64 --sbom=true --provenance=true --pull --tag zeliotcentralregistry/condense-pipeline-service:1.7.68-SAAS . --push


docker buildx build --platform linux/amd64 --pull --tag  zeliotcentralregistry/condense-data-simulator:1.0.5 --push .
