# Bundler Setup for Tests

The tests use Skandha bundler for ERC-4337 integration testing. Skandha is not available as an npm package, so you have a few options:

## Option 1: Use Docker (Recommended)

1. **Pull the Skandha Docker image:**
   ```bash
   docker pull etherspot/skandha:latest
   ```

2. **Run tests:**
   ```bash
   npm test
   ```

   The test setup will automatically start Skandha in a Docker container.

## Option 2: Clone and Build from Source

1. **Clone Skandha repository:**
   ```bash
   cd ..
   git clone https://github.com/etherspot/skandha
   cd skandha
   ```

2. **Build Skandha:**
   ```bash
   yarn install
   yarn build
   yarn bootstrap
   ```

3. **Make sure the binary is executable:**
   ```bash
   chmod +x skandha
   ```

4. **Run tests from the implementation directory:**
   ```bash
   cd ../1trillionsecurity/implementation
   npm test
   ```

   The test setup will detect the Skandha binary in `../skandha/skandha`.

## Option 3: Skip Bundler Tests

If you don't need bundler integration tests, you can skip them:

```bash
SKIP_BUNDLER=1 npm test
```

## Option 4: Use a Different Bundler

You can modify the test setup to use a different ERC-4337 bundler that is available on npm, such as:
- Pimlico (via their API)
- Alchemy's bundler (via their API)
- A local mock bundler for testing

## Manual Bundler Setup

If you want to run the bundler manually:

1. **Create config file** at `test/helpers/skandha-config.json`:
   ```json
   {
     "rpcUrl": "http://localhost:8545",
     "entryPoint": "0x...",
     "chainId": 31337,
     "port": 14337
   }
   ```

2. **Start bundler:**
   ```bash
   # With Docker
   docker run --rm -d -p 14337:14337 \
     --mount type=bind,source=$(pwd)/test/helpers/skandha-config.json,target=/usr/app/config.json,readonly \
     etherspot/skandha:latest standalone
   
   # Or from source
   ../skandha/skandha standalone --config test/helpers/skandha-config.json
   ```

3. **Run tests:**
   ```bash
   npm test
   ```

## Troubleshooting

- **Docker not found**: Install Docker Desktop or use Option 2/3
- **Bundler connection refused**: Make sure the bundler is running on port 14337
- **EntryPoint not found**: The test setup will deploy EntryPoint automatically, or set `ENTRYPOINT_ADDRESS` env var

