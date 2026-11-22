/** Word 任务窗格：打开编辑器对话框，接收结果并写入文档 */
import { ChunkReceiver, loadOfficeJs, sendChunked, type Msg } from './protocol';
import { clearTag, findSelectedDiagram, insertDiagram, type EditTarget } from './word';

const statusEl = document.getElementById('status') as HTMLElement;
const btnNew = document.getElementById('btn-new') as HTMLButtonElement;
const btnEdit = document.getElementById('btn-edit') as HTMLButtonElement;

let dialog: Office.Dialog | null = null;

function setStatus(text: string, error = false): void {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', error);
}

function setBusy(busy: boolean): void {
  btnNew.disabled = busy;
  btnEdit.disabled = busy;
}

function editorUrl(): string {
  return new URL('../index.html?host=office', location.href).href;
}

function openEditor(target: EditTarget | null, notice?: string): void {
  if (dialog) {
    setStatus('编辑器已打开');
    return;
  }
  setBusy(true);
  Office.context.ui.displayDialogAsync(editorUrl(), { height: 88, width: 85, promptBeforeOpen: false }, (res) => {
    if (res.status !== Office.AsyncResultStatus.Succeeded) {
      setBusy(false);
      setStatus(`无法打开编辑器：${res.error.message}`, true);
      return;
    }
    const dlg = res.value;
    dialog = dlg;
    setStatus(target ? '正在编辑示意图…' : '正在绘制新示意图…');

    const send = (m: Msg) => sendChunked((s) => dlg.messageChild(s), m);
    const finish = (text: string, error = false) => {
      dialog = null;
      setBusy(false);
      setStatus(text, error);
    };

    const receiver = new ChunkReceiver(async (m) => {
      switch (m.type) {
        case 'ready':
          send({ type: 'init', data: target?.data ?? null, notice });
          break;
        case 'cancel':
          dlg.close();
          if (target) await clearTag(target.tag).catch(() => undefined);
          finish('已取消');
          break;
        case 'insert':
          try {
            await insertDiagram(m.payload, target);
            dlg.close();
            finish(target ? '示意图已更新' : '示意图已插入');
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            send({ type: 'error', message: `写入 Word 失败：${message}` });
            setStatus(`写入 Word 失败：${message}`, true);
          }
          break;
      }
    });

    dlg.addEventHandler(Office.EventType.DialogMessageReceived, (arg) => {
      if ('message' in arg) receiver.push(arg.message);
    });
    dlg.addEventHandler(Office.EventType.DialogEventReceived, () => {
      // 用户直接关闭对话框
      if (target) clearTag(target.tag).catch(() => undefined);
      finish('编辑器已关闭');
    });
  });
}

async function editSelected(): Promise<void> {
  try {
    const target = await findSelectedDiagram();
    if (!target) {
      setStatus('请先在文档中单击选中一个由 Epure 插入的示意图', true);
      return;
    }
    openEditor(target);
  } catch (err) {
    setStatus(`读取选中图片失败：${err instanceof Error ? err.message : String(err)}`, true);
  }
}

loadOfficeJs()
  .then(() => {
    if (!Office.context.requirements.isSetSupported('DialogApi', '1.2')) {
      setStatus('当前 Word 版本过旧（需要支持 DialogApi 1.2，Office 2021 / 365 及以上）', true);
      return;
    }
    btnNew.addEventListener('click', () => openEditor(null));
    btnEdit.addEventListener('click', () => void editSelected());
    setBusy(false);
    setStatus('就绪');
  })
  .catch((err: unknown) => setStatus(String(err), true));
