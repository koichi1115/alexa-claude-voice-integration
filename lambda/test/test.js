/**
 * ローカルテスト用スクリプト
 * Claude APIとの接続をテスト
 */

const { ClaudeClient } = require('../src/claude-client');

// テスト用APIキー（環境変数から取得）
const API_KEY = process.env.ANTHROPIC_API_KEY;

if (!API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY environment variable is not set');
  console.log('Usage: ANTHROPIC_API_KEY=sk-ant-... node test.js');
  process.exit(1);
}

async function runTests() {
  console.log('=== Alexa-Claude Voice Connector Tests ===\n');

  const client = new ClaudeClient(API_KEY);

  // Test 1: Basic Chat
  console.log('Test 1: Basic Chat');
  console.log('-'.repeat(40));
  try {
    const response = await client.chat('こんにちは、今日の調子はどう？');
    console.log('Speech:', response.speech);
    console.log('Card:', response.card);
    console.log('✓ Test 1 Passed\n');
  } catch (error) {
    console.error('✗ Test 1 Failed:', error.message, '\n');
  }

  // Test 2: Multi-turn Conversation
  console.log('Test 2: Multi-turn Conversation');
  console.log('-'.repeat(40));
  try {
    const history = [];

    // Turn 1
    const response1 = await client.chat('私の名前は田中です', history);
    history.push({ role: 'user', content: '私の名前は田中です' });
    history.push({ role: 'assistant', content: response1.speech });
    console.log('Turn 1 Speech:', response1.speech);

    // Turn 2 - Should remember the name
    const response2 = await client.chat('私の名前を覚えてる？', history);
    console.log('Turn 2 Speech:', response2.speech);

    if (response2.speech.includes('田中') || response2.card.includes('田中')) {
      console.log('✓ Test 2 Passed (Context retained)\n');
    } else {
      console.log('⚠ Test 2 Warning: Context may not be retained\n');
    }
  } catch (error) {
    console.error('✗ Test 2 Failed:', error.message, '\n');
  }

  // Test 3: Persona Switch
  console.log('Test 3: Persona Switch');
  console.log('-'.repeat(40));
  try {
    client.switchPersona('ギンさん');
    console.log('Current Persona:', client.getCurrentPersonaName());

    const response = await client.chat('自己紹介して');
    console.log('Speech:', response.speech);

    // Reset to default
    client.switchPersona('標準');
    console.log('✓ Test 3 Passed\n');
  } catch (error) {
    console.error('✗ Test 3 Failed:', error.message, '\n');
  }

  // Test 4: Model Switch
  console.log('Test 4: Model Switch');
  console.log('-'.repeat(40));
  try {
    console.log('Default Model:', client.getCurrentModelName());

    client.switchModel('ソネット');
    console.log('After Switch:', client.getCurrentModelName());

    // Switch back to Haiku
    client.switchModel('ハイク');
    console.log('Reverted to:', client.getCurrentModelName());
    console.log('✓ Test 4 Passed\n');
  } catch (error) {
    console.error('✗ Test 4 Failed:', error.message, '\n');
  }

  // Test 5: Response Sanitization
  console.log('Test 5: Response Sanitization');
  console.log('-'.repeat(40));
  try {
    const response = await client.chat('マークダウンで箇条書きを書いて');
    console.log('Speech:', response.speech);
    console.log('Card:', response.card);

    if (!response.speech.includes('*') && !response.speech.includes('#')) {
      console.log('✓ Test 5 Passed (Markdown removed)\n');
    } else {
      console.log('⚠ Test 5 Warning: Markdown may still be present\n');
    }
  } catch (error) {
    console.error('✗ Test 5 Failed:', error.message, '\n');
  }

  console.log('=== All Tests Completed ===');
}

runTests().catch(console.error);
