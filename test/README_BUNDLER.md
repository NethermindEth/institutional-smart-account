Bundler Setup for Testing

## Quick Start (Skip Bundler Tests)

If you just want to run tests without bundler:

```bash
SKIP_BUNDLER=1 npm test
```

## Option 1: Use Docker (Easiest)

1. **Install Docker** (if not already installed)

2. **Pull the Skandha image:**
   ```bash
   docker pull etherspot/skandha:latest
   ```

3. **Run tests:**
   ```bash
   npm test
   ```

   The test setup will automatically:
   - Detect Docker
   - Start Skandha in a container
   - Configure it with the correct EntryPoint and RPC URL
   - Clean up after tests

## Option 2: Clone from Source

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

3. **Make binary executable:**
   ```bash
   chmod +x skandha
   ```

4. **Run tests:**
   ```bash
   cd ../1trillionsecurity/implementation
   npm test
   ```

   The test setup will detect the Skandha binary at `../skandha/skandha`.

## Option 3: Manual Setup

If you want to run the bundler manually:

1. **Set up Skandha** (using Docker or source, as above)

2. **Create config file** at `test/helpers/skandha-config.json`:
   ```json
   {
     "rpcUrl": "http://localhost:8545",
     "entryPoint": "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
     "chainId": 31337,
     "port": 14337
   }
   ```

3. **Start bundler:**
   ```bash
   # Docker
   docker run --rm -d -p 14337:14337 \
     --mount type=bind,source=$(pwd)/test/helpers/skandha-config.json,target=/usr/app/config.json,readonly \
     --name skandha-bundler-test \
     etherspot/skandha:latest standalone
   
   # Or from source
   ../skandha/skandha standalone --config test/helpers/skandha-config.json
   ```

4. **Run tests:**
   ```bash
   npm test
   ```

5. **Stop bundler:**
   ```bash
   # Docker
   docker stop skandha-bundler-test
   
   # Or from source
   # Press Ctrl+C in the terminal running Skandha
   ```

## Test Behavior

- **With bundler**: Full integration tests including bundler submission
- **Without bundler** (`SKIP_BUNDLER=1`): Tests use direct EntryPoint submission (still tests ERC-4337 functionality)
- **Bundler tests**: Will automatically skip if bundler is not available

## Troubleshooting

- **"Bundler not found"**: Either set `SKIP_BUNDLER=1` or set up bundler using one of the options above
- **"Connection refused"**: Make sure bundler is running on port 14337
- **Docker errors**: Make sure Docker is running and you have permission to use it
- **EntryPoint errors**: The test setup will deploy EntryPoint automatically

## What Gets Tested

Even without bundler, the tests still verify:
- ✅ UserOperation building and signing
- ✅ EntryPoint integration
- ✅ Transaction proposal and execution
- ✅ Multi-level approval flow
- ✅ SDK functionality

With bundler, additional tests verify:
- ✅ Bundler submission
- ✅ Bundler validation
- ✅ End-to-end bundler flow

