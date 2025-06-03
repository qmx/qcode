import nock from 'nock';
import fs from 'fs/promises';
import path from 'path';

export interface VCRRecordingOptions {
  enableRequestHeaders?: boolean;
  outputObjects?: boolean;
}

export class VCRHelper {
  private recordingsPath: string;
  private testFile: string;
  private isRecording: boolean;

  constructor(testFile: string, recordingsDir: string = '../fixtures/recordings') {
    this.testFile = testFile;
    this.recordingsPath = path.join(path.dirname(testFile), recordingsDir);
    this.isRecording = process.env.NOCK_MODE === 'record';
  }

  /**
   * Check if we're in recording mode
   */
  get recording(): boolean {
    return this.isRecording;
  }

  /**
   * Initialize VCR recordings directory
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.recordingsPath, { recursive: true });
  }

  /**
   * Set up VCR for each test
   */
  setupTest(options: VCRRecordingOptions = {}): void {
    if (this.isRecording) {
      // In record mode, allow real HTTP and record the interactions
      nock.restore();
      nock.recorder.rec({
        output_objects: options.outputObjects ?? true,
        enable_reqheaders_recording: options.enableRequestHeaders ?? false,
      });
    } else {
      // In replay mode, don't allow real HTTP requests
      nock.disableNetConnect();
    }
  }

  /**
   * Clean up VCR after each test
   */
  teardownTest(): void {
    if (this.isRecording) {
      nock.recorder.clear();
    } else {
      nock.cleanAll();
    }
  }

  /**
   * Load and apply recorded interactions for a test
   * FAILS HARD if recording is missing in replay mode
   */
  async loadRecording(testName: string): Promise<void> {
    if (this.isRecording) {
      return; // No need to load recordings in record mode
    }

    const recordingFile = path.join(this.recordingsPath, `${testName}.json`);

    try {
      const recordings = JSON.parse(await fs.readFile(recordingFile, 'utf-8'));
      recordings.forEach((recording: any) => {
        const scope = nock(recording.scope);

        // Handle different HTTP methods
        switch (recording.method.toLowerCase()) {
          case 'get':
            scope.get(recording.path).reply(recording.status, recording.response);
            break;
          case 'post':
            scope.post(recording.path).reply(recording.status, recording.response);
            break;
          case 'put':
            scope.put(recording.path).reply(recording.status, recording.response);
            break;
          case 'delete':
            scope.delete(recording.path).reply(recording.status, recording.response);
            break;
          case 'patch':
            scope.patch(recording.path).reply(recording.status, recording.response);
            break;
          default:
            throw new Error(`Unsupported HTTP method in recording: ${recording.method}`);
        }
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(
        `❌ VCR Recording missing for test "${testName}"\n` +
          `Recording file not found: ${recordingFile}\n\n` +
          `To fix this:\n` +
          `1. Run: NOCK_MODE=record npm test -- ${this.testFile}\n` +
          `2. Ensure Ollama is running: ollama serve\n` +
          `3. Check that recording was created in ${this.recordingsPath}/\n\n` +
          `Original error: ${errorMessage}`
      );
    }
  }

  /**
   * Save recorded interactions for a test
   */
  async saveRecording(testName: string): Promise<void> {
    if (!this.isRecording) {
      return; // No need to save recordings in replay mode
    }

    const recordings = nock.recorder.play();
    if (recordings.length > 0) {
      const recordingFile = path.join(this.recordingsPath, `${testName}.json`);
      await fs.writeFile(recordingFile, JSON.stringify(recordings, null, 2));
      console.log(`📼 Recorded ${recordings.length} HTTP interactions to ${recordingFile}`);
    } else {
      console.log(`⚠️  No HTTP interactions recorded for test "${testName}"`);
    }
    nock.recorder.clear();
  }

  /**
   * Convenience method for complete VCR test workflow
   * This handles the entire recording/playback lifecycle automatically
   */
  async withRecording<T>(testName: string, testFn: () => Promise<T>): Promise<T> {
    await this.loadRecording(testName);

    try {
      const result = await testFn();
      await this.saveRecording(testName);
      return result;
    } catch (error) {
      await this.saveRecording(testName); // Save recording even on test failure
      throw error;
    }
  }

  /**
   * Log a message only when recording (useful for debugging)
   */
  recordingLog(message: string, ...args: any[]): void {
    if (this.isRecording) {
      console.log(message, ...args);
    }
  }

  /**
   * Create a VCR helper instance for a test file
   */
  static forTestFile(testFile: string, recordingsDir?: string): VCRHelper {
    return new VCRHelper(testFile, recordingsDir);
  }

  /**
   * Get the path to a specific recording file
   */
  getRecordingPath(testName: string): string {
    return path.join(this.recordingsPath, `${testName}.json`);
  }

  /**
   * Check if a recording exists for a test
   */
  async hasRecording(testName: string): Promise<boolean> {
    try {
      await fs.access(this.getRecordingPath(testName));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a recording file (useful for re-recording)
   */
  async deleteRecording(testName: string): Promise<void> {
    try {
      await fs.unlink(this.getRecordingPath(testName));
      console.log(`🗑️  Deleted recording: ${testName}.json`);
    } catch (error) {
      // File doesn't exist, which is fine
    }
  }

  /**
   * List all available recordings
   */
  async listRecordings(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.recordingsPath);
      return files.filter(file => file.endsWith('.json')).map(file => file.replace('.json', ''));
    } catch {
      return [];
    }
  }
}

/**
 * Convenience function to create VCR helper for current test file
 */
export function createVCRHelper(testFile: string, recordingsDir?: string): VCRHelper {
  return VCRHelper.forTestFile(testFile, recordingsDir);
}

/**
 * Setup function for Jest describe blocks
 */
export function setupVCRTests(testFile: string, recordingsDir?: string): VCRHelper {
  const vcr = createVCRHelper(testFile, recordingsDir);

  beforeAll(async () => {
    await vcr.initialize();
  });

  beforeEach(() => {
    vcr.setupTest();
  });

  afterEach(() => {
    vcr.teardownTest();
  });

  return vcr;
}
