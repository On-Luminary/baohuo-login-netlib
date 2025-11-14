const axios = require('axios');
const { chromium } = require('playwright');

const pushPlusToken = process.env.PUSH_PLUS_TOKEN; // PushPlus Token
const accounts = process.env.ACCOUNTS;

if (!accounts) {
  console.log('❌ 未配置账号');
  process.exit(1);
}

// 解析多个账号，支持逗号或分号分隔
const accountList = accounts.split(/[,;]/).map(account => {
  const [user, pass] = account.split(":").map(s => s.trim());
  return { user, pass };
}).filter(acc => acc.user && acc.pass);

if (accountList.length === 0) {
  console.log('❌ 账号格式错误，应为 username1:password1,username2:password2');
  process.exit(1);
}

async function sendPushPlus(message) {
  if (!pushPlusToken) {
    console.log('⚠️ 未配置PushPlus Token，跳过消息推送');
    return;
  }

  const now = new Date();
  const hkTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  const timeStr = hkTime.toISOString().replace('T', ' ').substr(0, 19) + " HKT";

  // 构建PushPlus消息内容 [1,6](@ref)
  const title = `🎉 Netlib 登录通知`;
  const content = `
登录时间：${timeStr}

${message}

<hr/>
<center>🤖 本消息由自动化脚本发送</center>
  `.trim();

  const requestData = {
    token: pushPlusToken,
    title: title,
    content: content,
    template: 'html' // 使用HTML模板，支持更丰富的格式 [2](@ref)
  };

  try {
    const response = await axios.post('http://www.pushplus.plus/send', requestData, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data.code === 200) {
      console.log('✅ PushPlus 通知发送成功');
    } else {
      console.log('⚠️ PushPlus 发送失败:', response.data.msg);
    }
  } catch (error) {
    console.log('⚠️ PushPlus 发送异常:', error.message);
  }
}

async function loginWithAccount(user, pass) {
  console.log(`\n🚀 开始登录账号: ${user}`);
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  let page;
  let result = { user, success: false, message: '' };
  
  try {
    const context = await browser.newContext();
    page = await context.newPage();
    page.setDefaultTimeout(30000);
    
    console.log(`📱 ${user} - 正在访问网站...`);
    await page.goto('https://www.netlib.re/', { waitUntil: 'networkidle' });
    
    // 使用更智能的元素定位策略
    console.log(`🔑 ${user} - 寻找登录按钮...`);
    
    let loginButton;
    try {
      loginButton = page.getByRole('button', { name: /login|登录|sign in/i });
      await loginButton.waitFor({ state: 'visible', timeout: 5000 });
    } catch (e) {
      loginButton = page.getByText(/login|登录|sign in/i);
      await loginButton.waitFor({ state: 'visible', timeout: 5000 });
    }
    
    await loginButton.click();
    console.log(`✅ ${user} - 登录按钮点击成功`);
    
    await page.waitForTimeout(2000);
    
    console.log(`📝 ${user} - 填写用户名...`);
    const usernameSelectors = [
      'input[name="username"]',
      'input[type="text"]',
      'input[placeholder*="username" i]',
      'input[placeholder*="email" i]',
      'input[placeholder*="user" i]'
    ];
    
    let usernameFilled = false;
    for (const selector of usernameSelectors) {
      try {
        await page.fill(selector, user, { timeout: 1000 });
        usernameFilled = true;
        console.log(`✅ ${user} - 用户名填写成功 (使用选择器: ${selector})`);
        break;
      } catch (e) {}
    }
    
    if (!usernameFilled) {
      try {
        await page.getByLabel(/username|email|用户|账号/i).fill(user);
        usernameFilled = true;
      } catch (e) {
        throw new Error('无法找到用户名输入框');
      }
    }
    
    console.log(`🔒 ${user} - 填写密码...`);
    const passwordSelectors = [
      'input[name="password"]',
      'input[type="password"]',
      'input[placeholder*="password" i]',
      'input[placeholder*="密码" i]'
    ];
    
    let passwordFilled = false;
    for (const selector of passwordSelectors) {
      try {
        await page.fill(selector, pass, { timeout: 1000 });
        passwordFilled = true;
        console.log(`✅ ${user} - 密码填写成功 (使用选择器: ${selector})`);
        break;
      } catch (e) {}
    }
    
    if (!passwordFilled) {
      try {
        await page.getByLabel(/password|密码/i).fill(pass);
        passwordFilled = true;
      } catch (e) {
        throw new Error('无法找到密码输入框');
      }
    }
    
    console.log(`📤 ${user} - 提交登录...`);
    const submitSelectors = [
      'button:has-text("Validate")',
      'button:has-text("Login")',
      'button:has-text("登录")',
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Sign In")'
    ];
    
    let submitted = false;
    for (const selector of submitSelectors) {
      try {
        await page.click(selector, { timeout: 2000 });
        submitted = true;
        console.log(`✅ ${user} - 登录提交成功 (使用选择器: ${selector})`);
        break;
      } catch (e) {}
    }
    
    if (!submitted) {
      try {
        await page.getByRole('button', { name: /validate|login|登录|sign in|提交|确认/i }).click();
        submitted = true;
      } catch (e) {
        throw new Error('无法找到提交按钮');
      }
    }
    
    await page.waitForTimeout(5000);
    
    const successIndicators = [
      () => page.getByText(user, { exact: false }).waitFor({ state: 'visible', timeout: 5000 }),
      () => page.getByText(/welcome|欢迎|dashboard|控制板/i).waitFor({ state: 'visible', timeout: 5000 }),
      () => page.getByText(/exclusive owner/i).waitFor({ state: 'visible', timeout: 5000 }),
      () => page.waitForURL('**/dashboard**', { timeout: 5000 }),
      () => page.waitForURL('**/account**', { timeout: 5000 })
    ];
    
    let loginVerified = false;
    for (const indicator of successIndicators) {
      try {
        await indicator();
        loginVerified = true;
        console.log(`✅ ${user} - 登录成功验证通过`);
        break;
      } catch (e) {}
    }
    
    if (loginVerified) {
      console.log(`✅ ${user} - 登录成功`);
      result.success = true;
      result.message = `✅ ${user} 登录成功`;
    } else {
      let errorMessage = '未知错误';
      const errorSelectors = [
        '.error',
        '.alert-danger',
        '[class*="error"]',
        '[class*="alert"]',
        'text=/error|错误|invalid|失败/i'
      ];
      
      for (const selector of errorSelectors) {
        try {
          const errorText = await page.textContent(selector, { timeout: 1000 });
          if (errorText && errorText.length < 100) {
            errorMessage = errorText.trim();
            break;
          }
        } catch (e) {}
      }
      
      console.log(`❌ ${user} - 登录失败: ${errorMessage}`);
      result.message = `❌ ${user} 登录失败: ${errorMessage}`;
    }
    
  } catch (e) {
    console.log(`❌ ${user} - 登录异常: ${e.message}`);
    result.message = `❌ ${user} 登录异常: ${e.message}`;
    
    try {
      await page.screenshot({ path: `error_${user}_${Date.now()}.png`, fullPage: true });
      console.log(`📸 ${user} - 错误截图已保存`);
    } catch (screenshotError) {
      console.log(`⚠️ ${user} - 截图失败: ${screenshotError.message}`);
    }
  } finally {
    if (page) await page.close();
    await browser.close();
  }
  
  return result;
}

async function main() {
  console.log(`🔍 发现 ${accountList.length} 个账号需要登录`);
  
  const results = [];
  
  for (let i = 0; i < accountList.length; i++) {
    const { user, pass } = accountList[i];
    console.log(`\n📋 处理第 ${i + 1}/${accountList.length} 个账号: ${user}`);
    
    const result = await loginWithAccount(user, pass);
    results.push(result);
    
    if (i < accountList.length - 1) {
      const delay = 5000 + Math.random() * 2000;
      console.log(`⏳ 等待${Math.round(delay/1000)}秒后处理下一个账号...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;
  
  let summaryMessage = `📊 Netlib 登录汇总: ${successCount}/${totalCount} 个账号成功\n\n`;
  
  results.forEach(result => {
    const statusIcon = result.success ? '✅' : '❌';
    summaryMessage += `${statusIcon} ${result.message}\n`;
  });
  
  const now = new Date();
  const hkTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  summaryMessage += `\n⏰ 执行时间: ${hkTime.toISOString().replace('T', ' ').substr(0, 19)} HKT`;
  
  await sendPushPlus(summaryMessage);
  
  console.log('\n🎉 所有账号处理完成！');
  console.log(`📈 成功: ${successCount}, 失败: ${totalCount - successCount}`);
  
  process.exit(successCount > 0 ? 0 : 1);
}

process.on('SIGINT', async () => {
  console.log('\n⚠️ 程序被用户中断');
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('未处理的Promise拒绝:', error);
  process.exit(1);
});

main().catch(async (error) => {
  console.error('程序执行出错:', error);
  if (pushPlusToken) {
    await sendPushPlus(`💥 程序执行出错: ${error.message}`);
  }
  process.exit(1);
});
