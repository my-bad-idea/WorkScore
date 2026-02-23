; WorkScore Windows 安装程序 (Inno Setup)
; 构建前请先执行: npm run build:packaged
; 编译时传入版本号（从 package.json 自动读取）:
;   for /f %v in ('node -p "require('./package.json').version"') do iscc /DMyAppVersion=%v scripts/install-windows.iss

#define MyAppName "WorkScore"
#define MyAppPublisher "WorkScore"
#define MyAppURL ""
#ifndef MyAppVersion
  #define MyAppVersion "0.0.0"
#endif

[Setup]
AppId={#MyAppName}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={localappdata}\{#MyAppName}
DefaultGroupName={#MyAppName}
OutputDir=..\dist\installers
OutputBaseFilename=WorkScore-Setup-{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "chinesesimplified"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[CustomMessages]
chinesesimplified.PortPrompt=服务端口 (1-65535，默认 3000)
chinesesimplified.ConfigPageTitle=服务配置
chinesesimplified.ConfigPageDesc=请设置服务监听端口，安装后可在安装目录下修改 config.json 更改。

[Code]
var
  ConfigPage: TInputQueryWizardPage;
  PortValue: String;

procedure InitializeWizard;
begin
  ConfigPage := CreateInputQueryPage(wpSelectDir,
    ExpandConstant('{cm:ConfigPageTitle}'),
    ExpandConstant('{cm:ConfigPageDesc}'),
    '');
  ConfigPage.Add(ExpandConstant('{cm:PortPrompt}'), False);
  ConfigPage.Values[0] := '3000';
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  P: Integer;
begin
  Result := True;
  if CurPageID = ConfigPage.ID then
  begin
    PortValue := ConfigPage.Values[0];
    if not TryStrToInt(Trim(PortValue), P) or (P < 1) or (P > 65535) then
    begin
      MsgBox('请输入 1 到 65535 之间的端口号。', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ConfigPath: String;
  ConfigContent: String;
begin
  if CurStep = ssPostInstall then
  begin
    if PortValue = '' then PortValue := '3000';
    ConfigPath := ExpandConstant('{app}\config.json');
    ConfigContent := '{"port": ' + PortValue + '}' + #13#10;
    SaveStringToFile(ConfigPath, ConfigContent, False);
  end;
end;

[Files]
; 路径相对于 .iss 所在目录，需在项目根目录执行 iscc（或使用完整路径）。构建前请执行 npm run build:packaged
Source: "..\backend\dist\*"; DestDir: "{app}\dist"; Flags: recursesubdirs ignoreversion
Source: "..\backend\public\*"; DestDir: "{app}\public"; Flags: recursesubdirs ignoreversion
Source: "..\backend\node_modules\*"; DestDir: "{app}\node_modules"; Flags: recursesubdirs ignoreversion
Source: "start.bat"; DestDir: "{app}"; Flags: ignoreversion

[Dirs]
Name: "{app}"; Permissions: users-modify

[Icons]
Name: "{group}\启动 {#MyAppName}"; Filename: "{app}\start.bat"; Comment: "工作智能评分平台"
Name: "{group}\卸载 {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\启动 {#MyAppName}"; Filename: "{app}\start.bat"; Comment: "工作智能评分平台"

[Run]
Filename: "{app}\start.bat"; Description: "立即启动 {#MyAppName}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}\dist"
Type: filesandordirs; Name: "{app}\public"
Type: filesandordirs; Name: "{app}\node_modules"
Type: files; Name: "{app}\data.sqlite"
Type: files; Name: "{app}\config.json"
