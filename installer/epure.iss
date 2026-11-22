; Epure 示意图 —— WPS 加载项安装程序（Inno Setup 7）
; 由 tools/build-release.mjs 调用：ISCC /DAppVersion=x.y.z /DAddinDir=<release\addin> /DOutputDir=<release> epure.iss
;
; 安装内容：
;   %APPDATA%\kingsoft\wps\jsaddons\epure_<版本>\   加载项文件（WPS 本地加载，不需要网址、不需要联网）
;   %APPDATA%\kingsoft\wps\jsaddons\publish.xml    登记本地加载项 <jsplugin .../>（合并写入，保留其他加载项）
;
; 说明：WPS 个人版的加载项列表是 publish.xml——网址加载项为 <jspluginonline>，本地加载项为 <jsplugin>
; （与 WPS 自带加载项安装服务 jsapisubserver 的写法一致）。jsplugins.xml 只是企业版从服务器下载的列表缓存，个人版不读取。
; 按当前用户安装，不需要管理员权限。

#ifndef AppVersion
  #define AppVersion "2.0.0"
#endif
#ifndef AddinDir
  #define AddinDir "..\release\addin"
#endif
#ifndef OutputDir
  #define OutputDir "..\release"
#endif

#define AppName "Epure 示意图"
#define AddinName "epure"

[Setup]
AppId={{64EFCE6B-AA4F-401C-A799-36A1D105B40C}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=Epure
VersionInfoVersion={#AppVersion}
VersionInfoDescription={#AppName} WPS 加载项安装程序
DefaultDirName={userappdata}\kingsoft\wps\jsaddons\{#AddinName}_{#AppVersion}
DisableDirPage=yes
; 安装目录随版本变化（epure_<版本>），升级时不沿用上一次的目录
UsePreviousAppDir=no
DisableProgramGroupPage=yes
DisableReadyPage=yes
PrivilegesRequired=lowest
UninstallFilesDir={userappdata}\Epure\uninstall
UninstallDisplayName={#AppName}（WPS 加载项）
UninstallDisplayIcon={uninstallexe}
SetupIconFile=icon.ico
OutputDir={#OutputDir}
OutputBaseFilename=Epure-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ShowLanguageDialog=no

[Languages]
Name: "chinesesimp"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[Messages]
chinesesimp.WelcomeLabel2=将在 WPS 文字中安装“Epure 示意图”选项卡，用于绘制数学、物理示意图，插入文档后可再次编辑。%n%n本程序只为当前 Windows 用户安装，不需要联网。
chinesesimp.FinishedLabel=安装完成。%n%n打开 WPS 文字后，功能区会出现“Epure 示意图”选项卡。%n%n首次加载时 WPS 可能询问是否信任此加载项，请选择“信任”。

[InstallDelete]
; 升级：删除旧版本目录
Type: filesandordirs; Name: "{userappdata}\kingsoft\wps\jsaddons\{#AddinName}_*"

[Files]
Source: "{#AddinDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Run]
Filename: "{code:WpsExe}"; Description: "立即启动 WPS 文字"; Flags: postinstall nowait skipifsilent unchecked; Check: WpsExeFound

[Code]
const
  ENTRY_LOCAL = '<jsplugin name="{#AddinName}"';
  ENTRY_ONLINE = '<jspluginonline name="{#AddinName}"';

function PublishXml: String;
begin
  Result := ExpandConstant('{userappdata}\kingsoft\wps\jsaddons\publish.xml');
end;

function ReadUtf8(const FileName: String): String;
var
  Raw: AnsiString;
begin
  Result := '';
  if FileExists(FileName) and LoadStringFromFile(FileName, Raw) then
    Result := Utf8Decode(Raw);
end;

procedure WriteUtf8(const FileName, Text: String);
begin
  ForceDirectories(ExtractFileDir(FileName));
  SaveStringToFile(FileName, Utf8Encode(Text), False);
end;

{ 去掉所有以 Start 开头的 <... /> 条目（含所在行） }
function RemoveTag(S, Start: String): String;
var
  P, Q, LineStart: Integer;
  Tail: String;
begin
  Result := S;
  P := Pos(Start, Result);
  while P > 0 do
  begin
    Tail := Copy(Result, P, Length(Result));
    Q := Pos('/>', Tail);
    if Q = 0 then Break;
    LineStart := P;
    while (LineStart > 1) and ((Result[LineStart - 1] = ' ') or (Result[LineStart - 1] = #9)) do
      LineStart := LineStart - 1;
    Delete(Result, LineStart, (P - LineStart) + Q + 1);
    if (LineStart <= Length(Result)) and (Result[LineStart] = #13) then Delete(Result, LineStart, 1);
    if (LineStart <= Length(Result)) and (Result[LineStart] = #10) then Delete(Result, LineStart, 1);
    P := Pos(Start, Result);
  end;
end;

{ 去掉本加载项的本地与网址（开发版）条目，避免出现两个选项卡 }
function RemoveEntry(S: String): String;
begin
  Result := RemoveTag(RemoveTag(S, ENTRY_LOCAL), ENTRY_ONLINE);
end;

procedure RegisterAddin;
var
  S, Entry: String;
  P: Integer;
begin
  { url 仅在本地目录缺失时供 WPS 下载用；本地目录存在时 WPS 直接从本地加载 }
  Entry := '  ' + ENTRY_LOCAL + ' type="wps" url="http://127.0.0.1/{#AddinName}/{#AddinName}.7z" version="{#AppVersion}" enable="enable" install="null"/>' + #13#10;
  S := RemoveEntry(ReadUtf8(PublishXml));
  P := Pos('</jsplugins>', S);
  if P > 0 then
    Insert(Entry, S, P)
  else
    S := '<?xml version="1.0" encoding="UTF-8"?>' + #13#10 + '<jsplugins>' + #13#10 + Entry + '</jsplugins>' + #13#10;
  WriteUtf8(PublishXml, S);
end;

procedure UnregisterAddin;
var
  S: String;
begin
  if not FileExists(PublishXml) then Exit;
  S := ReadUtf8(PublishXml);
  if Pos(ENTRY_LOCAL, S) > 0 then WriteUtf8(PublishXml, RemoveTag(S, ENTRY_LOCAL));
end;

function WpsInstallRoot: String;
begin
  Result := '';
  if not RegQueryStringValue(HKCU, 'SOFTWARE\Kingsoft\Office\6.0\common', 'InstallRoot', Result) then
    if not RegQueryStringValue(HKLM, 'SOFTWARE\Kingsoft\Office\6.0\common', 'InstallRoot', Result) then
      RegQueryStringValue(HKLM, 'SOFTWARE\WOW6432Node\Kingsoft\Office\6.0\common', 'InstallRoot', Result);
end;

function WpsExe(Param: String): String;
begin
  Result := AddBackslash(WpsInstallRoot) + 'office6\wps.exe';
end;

function WpsExeFound: Boolean;
begin
  Result := (WpsInstallRoot <> '') and FileExists(WpsExe(''));
end;

function IsProcessRunning(const Name: String): Boolean;
var
  Locator, Service, List: Variant;
begin
  Result := False;
  try
    Locator := CreateOleObject('WbemScripting.SWbemLocator');
    Service := Locator.ConnectServer('.', 'root\CIMV2');
    List := Service.ExecQuery('SELECT ProcessId FROM Win32_Process WHERE Name = ''' + Name + '''');
    Result := List.Count > 0;
  except
  end;
end;

function InitializeSetup: Boolean;
var
  R: Integer;
begin
  Result := True;
  if WpsInstallRoot = '' then
    if SuppressibleMsgBox('未检测到 WPS Office。' + #13#10#13#10 + 'Epure 示意图需要在 WPS 文字中使用。仍要继续安装吗？',
      mbConfirmation, MB_YESNO, IDYES) = IDNO then
    begin
      Result := False;
      Exit;
    end;
  while IsProcessRunning('wps.exe') do
  begin
    R := SuppressibleMsgBox('检测到 WPS 正在运行。' + #13#10#13#10 +
      '建议先保存文档并关闭 WPS，然后点“重试”。' + #13#10 +
      '也可以点“忽略”直接安装，安装后重启 WPS 即可看到选项卡。',
      mbInformation, MB_ABORTRETRYIGNORE, IDIGNORE);
    if R = IDABORT then
    begin
      Result := False;
      Exit;
    end;
    if R = IDIGNORE then Break;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then RegisterAddin;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then
  begin
    UnregisterAddin;
    DelTree(ExpandConstant('{userappdata}\kingsoft\wps\jsaddons\{#AddinName}_{#AppVersion}'), True, True, True);
  end;
end;
