import React from 'react';
import { X, Printer, Copy, FileText, Scale, ShieldCheck } from 'lucide-react';

interface LegalDocModalProps {
  type: 'offer' | 'policy' | 'consent' | null;
  onClose: () => void;
}

export function LegalDocModal({ type, onClose }: LegalDocModalProps) {
  const [copied, setCopied] = React.useState(false);

  if (!type) return null;

  const handleCopy = () => {
    const textElement = document.getElementById('legal-doc-content');
    if (textElement) {
      navigator.clipboard.writeText(textElement.innerText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const currentYear = new Date().getFullYear();

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-center justify-center p-4 md:p-6">
      <div className="bg-[#FBFBFA] w-full max-w-4xl max-h-[90vh] border border-black p-5 md:p-8 relative flex flex-col shadow-2xl overflow-hidden rounded-none text-neutral-800">
        
        {/* Header Actions */}
        <div className="flex items-center justify-between border-b border-black/10 pb-4 mb-5">
          <div className="flex items-center gap-2">
            {type === 'offer' && <Scale className="w-5 h-5 text-[#9c27b0]" />}
            {type === 'policy' && <ShieldCheck className="w-5 h-5 text-[#9c27b0]" />}
            {type === 'consent' && <FileText className="w-5 h-5 text-[#9c27b0]" />}
            <span className="font-serif italic text-lg font-bold">
              {type === 'offer' && 'Договор оферты'}
              {type === 'policy' && 'Политика конфиденциальности'}
              {type === 'consent' && 'Согласие на обработку персональных данных'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCopy}
              className="text-xs font-sans font-bold uppercase tracking-wider border border-black/10 px-3 py-1.5 hover:bg-black/5 transition-colors flex items-center gap-1.5 rounded-none cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              {copied ? 'Скопировано!' : 'Копировать'}
            </button>
            <button
              onClick={handlePrint}
              className="text-xs font-sans font-bold uppercase tracking-wider border border-black/10 px-3 py-1.5 hover:bg-black/5 transition-colors flex items-center gap-1.5 rounded-none cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Печать
            </button>
            <button
              onClick={onClose}
              className="p-1 px-2 border border-black hover:bg-black hover:text-white transition-colors cursor-pointer"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Legal Content */}
        <div 
          id="legal-doc-content"
          className="overflow-y-auto pr-2 text-xs font-sans space-y-4 leading-relaxed tracking-normal select-text print:text-black print:overflow-visible max-h-[70vh]"
        >
          {type === 'offer' && (
            <>
              <h1 className="text-sm font-bold uppercase tracking-wider text-center border-b border-black/5 pb-2">
                ПУБЛИЧНЫЙ ДОГОВОР-ОФЕРТА НА ОКАЗАНИЕ ИНФОРМАЦИОННЫХ УСЛУГ
              </h1>
              <p className="text-right italic font-medium">Редакция от 26 мая 2026 года</p>
              
              <h2 className="font-bold text-neutral-950 mt-4">1. ОБЩИЕ ПОЛОЖЕНИЯ И ТЕРМИНЫ</h2>
              <p>
                1.1. Настоящий документ представляет собой официальное публичное предложение (публичную оферту) 
                <strong>Индивидуального предпринимателя Жегаловой Александры Сергеевны</strong> (ОГРНИП 3196313300043142, ИНН 631625819168) (далее по тексту — «Исполнитель») для любого физического лица (далее по тексту — «Пользователь»), которое примет данное предложение на указанных ниже условиях.
              </p>
              <p>
                1.2. В соответствии с пунктом 2 статьи 437 Гражданского Кодекса Российской Федерации (ГК РФ) в случае принятия изложенных ниже условий и оплаты услуг физическое лицо, производимое акцепт настоящей оферты, становится Пользователем (в соответствии с пунктом 3 статьи 438 ГК РФ акцепт оферты равносилен заключению договора на условиях, изложенных в оферте).
              </p>
              <p>
                1.3. Под услугами в рамках настоящего Договора понимается предоставление Пользователю доступа к функционалу веб-сервиса FashionFinder (FashionFinder PRO) для осуществления визуального поиска, подбора и анализа предметов одежды, обуви и аксессуаров по фотографиям и изображениям.
              </p>

              <h2 className="font-bold text-neutral-950 mt-4">2. ПОРЯДОК ЗАКЛЮЧЕНИЯ ДОГОВОРА (АКЦЕПТ ОФЕРТЫ)</h2>
              <p>
                2.1. Акцептом (принятием) условий настоящей оферты со стороны Пользователя является осуществление им любого из следующих действий:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Создание учетной записи (регистрация) в приложении/на сайте FashionFinder;</li>
                <li>Произведение оплаты услуг Исполнителя через встроенную платежную систему в порядке, установленном разделом 4 настоящего Договора;</li>
                <li>Фактическое использование любых аналитических сервисов Исполнителя.</li>
              </ul>
              <p>
                2.2. Осуществляя акцепт, Пользователь гарантирует, что ознакомлен, согласен со всеми условиями оферты, Политикой конфиденциальности и дает полное и безусловное Согласие на обработку персональных данных.
              </p>

              <h2 className="font-bold text-neutral-950 mt-4">3. СТОИМОСТЬ УСЛУГ И ТАРИФНЫЕ ПЛАНЫ</h2>
              <p>
                3.1. Стоимость информационных услуг Исполнителя по предоставлению расширенного доступа FashionFinder PRO определяется в соответствии с действующими тарифными планами, опубликованными на сайте/в приложении:
              </p>
              <div className="border border-black/10 p-3 bg-neutral-50 my-2 space-y-2">
                <p><strong>• Тариф «1 день»:</strong> Доступ к возможностям FashionFinder PRO на период 24 часа с момента активации. Стоимость: <strong>49 рублей РФ</strong>.</p>
                <p><strong>• Тариф «1 неделя»:</strong> Доступ к возможностям FashionFinder PRO на период 7 календарных дней с момента активации. Стоимость: <strong>149 рублей РФ</strong>.</p>
                <p><strong>• Тариф «1 месяц»:</strong> Доступ к возможностям FashionFinder PRO на период 30 календарных дней с момента активации. Стоимость: <strong>390 рублей РФ</strong>.</p>
              </div>
              <p>
                3.2. Все пошлины и налоги за проведение транзакций включены в итоговую стоимость, предъявленную Пользователю на экране оплаты.
              </p>

              <h2 className="font-bold text-neutral-950 mt-4">4. ПОРЯДОК ОПЛАТЫ И ОРГАНИЗАЦИЯ ТРАНЗАКЦИЙ</h2>
              <p>
                4.1. Оплата предоставляемых услуг производится Пользователем в форме 100% предоплаты через электронные платежные шлюзы (включая СБП, банковские карты РФ, ЮMoney и иные интегрированные системы).
              </p>
              <p>
                4.2. Оплата считается совершенной, а доступ к FashionFinder PRO — активированным в момент подтверждения успешного списания платежным провайдером. Исполнитель не хранит и не обрабатывает персональные данные платежных карт Пользователя.
              </p>

              <h2 className="font-bold text-neutral-950 mt-4">5. ПРАВА И ОБЯЗАННОСТИ СТОРОНХ</h2>
              <p>
                5.1. <strong>Исполнитель обязуется:</strong>
                <br />
                Обеспечить бесперебойное (за исключением технических сбоев и обновлений) предоставление услуг по поиску модных товаров и аналитике изображений в пределах оплаченного Пользователем тарифа.
              </p>
              <p>
                5.2. <strong>Пользователь обязуется:</strong>
                <br />
                - Самостоятельно обеспечивать сохранность учетных записей.
                <br />
                - Не загружать изображения, содержащие запрещенные законодательством РФ материалы (включая порнографические, экстремистские, оскорбительные изображения).
              </p>

              <h2 className="font-bold text-neutral-950 mt-4">6. УСЛОВИЯ ВОЗВРАТА СРЕДСТВ И ТЕХНИЧЕСКАЯ ПОДДЕРЖКА</h2>
              <p>
                6.1. В соответствии со ст. 32 Закона РФ от 07.02.1992 N 2300-1 «О защите прав потребителей» и ст. 782 ГК РФ Пользователь имеет право отказаться от исполнения договора на оказание услуг в любое время, оплатив Исполнителю фактически понесенные им расходы.
              </p>
              <p>
                6.2. В связи с тем, что услуги Исполнителя по предоставлению расширенного доступа FashionFinder PRO считаются полностью оказанными с момента открытия полного технического доступа, возврат платы по тарифам осуществляет служба поддержки при обращении на адрес: <strong>miafleksa@yandex.ru</strong>. В заявлении на возврат указываются: дата приобретения, электронная почта аккаунта Пользователя, способ и сумма транзакции. Исполнитель возвращает средства за вычетом комиссии платежной системы в течение 10 (десяти) рабочих дней.
              </p>

              <h2 className="font-bold text-neutral-950 mt-4">7. СРОК ДЕЙСТВИЯ, ИЗМЕНЕНИЕ И ПРЕКРАЩЕНИЕ ДОГОВОРА</h2>
              <p>
                7.1. Настоящий Договор вступает в силу с момента акцепта оферты и действует до полного исполнения обязательств Сторонами в рамках оплаченного периода и тарифа.
              </p>
              <p>
                7.2. Исполнитель оставляет за собой право в одностороннем порядке изменять условия настоящей оферты, обновленный текст Оферты публикуется на сайте по адресу функционирования сервиса.
              </p>

              <h2 className="font-bold text-neutral-950 mt-4">8. РЕКВИЗИТЫ ИСПОЛНИТЕЛЯ</h2>
              <div className="border border-black p-4 bg-white font-mono space-y-1 my-2">
                <p><strong>Индивидуальный предприниматель:</strong> Жегалова Александра Сергеевна</p>
                <p><strong>ИНН:</strong> 631625819168</p>
                <p><strong>ОГРНИП:</strong> 3196313300043142</p>
                <p><strong>Расчетный счет:</strong> 40802810070010212258</p>
                <p><strong>Банк:</strong> МОСКОВСКИЙ ФИЛИАЛ АО КБ «МОДУЛЬБАНК»</p>
                <p><strong>Корр. счет:</strong> 30101810645250000092</p>
                <p><strong>БИК:</strong> 044525092</p>
                <p><strong>Email для обращений:</strong> miafleksa@yandex.ru</p>
              </div>
            </>
          )}

          {type === 'policy' && (
            <>
              <h1 className="text-sm font-bold uppercase tracking-wider text-center border-b border-black/5 pb-2">
                ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ И ОБРАБОТКИ ПЕРСОНАЛЬНЫХ ДАННЫХ
              </h1>
              <p className="text-right italic font-medium">Редакция от 26 мая 2026 года</p>

              <h2 className="font-bold text-neutral-950 mt-4">1. НАЗНАЧЕНИЕ ПОЛИТИКИ</h2>
              <p>
                Настоящая Политика составлена в соответствии с Федеральным законом РФ в области персональных данных № 152-ФЗ от 27.07.2006 г. и определяет порядок обработки, хранения и защиты конфиденциальной информации Пользователей, собираемой сервисом FashionFinder у ИП Жегаловой Александры Сергеевны (далее — «Оператор»).
              </p>

              <h2 className="font-bold text-neutral-950 mt-4">2. ПРИНЦИПЫ ОБРАБОТКИ ДАННЫХ</h2>
              <p>
                Обработка персональных данных Оператором осуществляется на основе принципов законности, прозрачности, конфиденциальности и строго для заявленных целей предоставления услуг поиска одежды на маркетплейсах.
              </p>

              <h2 className="font-bold text-neutral-955 mt-4">3. СОСТАВ СОБИРАЕМЫХ ПЕРСОНАЛЬНЫХ ДАННЫХ</h2>
              <p>
                Оператор обрабатывает следующие виды сведений, предоставляемые Пользователем или генерируемые автоматически при использовании сервиса:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Адрес электронной почты (Email) — используется для создания аккаунта и привязки PRO-тарифа;</li>
                <li>Изображения (фотографические материалы одежды), загружаемые пользователем для визуального анализа;</li>
                <li>Технические данные: IP-адрес, cookie, сведения о браузере, рефереры и временные маркеры.</li>
              </ul>

              <h2 className="font-bold text-neutral-950 mt-4">4. ЦЕЛИ ОБРАБОТКИ ДАННЫХ</h2>
              <p>
                Персональные данные Пользователей собираются исключительно в целях:
                <br />
                - идентификации и предоставления расширенных функций подписки FashionFinder PRO;
                <br />
                - отправки фискальных чеков и уведомлений о платежах;
                <br />
                - отправки рекомендаций и обработки обращений техподдержки;
                <br />
                - улучшения качества работы визуального искусственного интеллекта.
              </p>

              <h2 className="font-bold text-neutral-950 mt-4">5. УСЛОВИЯ ПЕРЕДАЧИ ТРЕТЬИМ ЛИЦАМ</h2>
              <p>
                Персональные данные пользователя никогда не продаются и не передаются рекламным агентствам. Передача данных третьим лицам возможна исключительно в рекламных/аналитических целях API (например, отправка закодированного изображения в Google Gemini API для классификации стиля) без раскрытия адреса электронной почты или платежных реквизитов пользователя.
              </p>

              <h2 className="font-bold text-neutral-950 mt-4">6. ПОРЯДОК ХРАНЕНИЯ И ЗАЩИТЫ</h2>
              <p>
                Хранение персональных данных осуществляется на защищенных облачных серверах. Мы используем протокол шифрования SSL/TLS при обмене данными между клиентом и сервером. Доступ к персональным базам данных строго разграничен.
              </p>

              <h2 className="font-bold text-neutral-950 mt-4">7. ПРАВА ПОЛЬЗОВАТЕЛЕЙ И ОТЗЫВ ДАННЫХ</h2>
              <p>
                Каждый Пользователь имеет право в любой момент потребовать полного удаления своего профиля и прекращения обработки его персональных данных, направив соответствующее письмо свободного стиля на электронный адрес: <strong>miafleksa@yandex.ru</strong>.
              </p>
              <p>
                Удаление профиля и связанных с ним данных (история поисков, Email) осуществляется в течение 3 (трех) календарных дней с даты получения запроса.
              </p>

              <h2 className="font-bold text-neutral-950 mt-4">8. СВЕДЕНИЯ ОБ ОПЕРАТОРЕ</h2>
              <p className="font-mono">
                ИП Жегалова Александра Сергеевна
                <br />
                ОГРНИП: 3196313300043142 | ИНН: 631625819168
                <br />
                Почта: miafleksa@yandex.ru
              </p>
            </>
          )}

          {type === 'consent' && (
            <>
              <h1 className="text-sm font-bold uppercase tracking-wider text-center border-b border-black/5 pb-2">
                СОГЛАСИЕ ПОЛЬЗОВАТЕЛЯ НА ОБРАБОТКУ ПЕРСОНАЛЬНЫХ ДАННЫХ
              </h1>
              
              <div className="border border-black/10 p-4 bg-white space-y-3">
                <p>
                  Пользователь, регистрируясь на веб-ресурсе FashionFinder, либо загружая изображение в поле поиска, подтверждает, что действует по своей воле и в своих интересах, а также предоставляет полное и безусловное согласие <strong>Индивидуальному предпринимателю Жегаловой Александре Сергеевне</strong> (ОГРНИП 3196313300043142, ИНН 631625819168) (далее — «Оператор») на обработку своих персональных данных на следующих условиях:
                </p>

                <p><strong>1. Перечень обрабатываемых персональных данных:</strong></p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Адрес электронной почты (Email);</li>
                  <li>Загружаемые фотографические материалы одежды и сопутствующий визуальный контент;</li>
                  <li>Данные об операционной системе, типе браузера, файлах cookie.</li>
                </ul>

                <p><strong>2. Способы обработки:</strong></p>
                <p>
                  Сбор, запись, систематизация, накопление, хранение, уточнение (обновление, изменение), извлечение, использование, передача обработанного изображения по API для анализа, блокирование, удаление и уничтожение. Обработка осуществляется как с применением средств автоматизации, так и без них.
                </p>

                <p><strong>3. Срок действия согласия:</strong></p>
                <p>
                  Настоящее согласие действует бессрочно с момента предоставления до дня его отзыва Пользователем в письменной форме путем отправки уведомления на электронный адрес: <strong>miafleksa@yandex.ru</strong>.
                </p>
                
                <p className="italic text-black/60 pt-2 border-t border-black/5">
                  Регистрируясь или выполняя поиск, я подтверждаю, что ознакомлен с Политикой конфиденциальности ИП Жегаловой А. С., а также осознаю свои права в соответствии со ст. 9 ФЗ-152 «О персональных данных».
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer Area inside Modal */}
        <div className="mt-5 border-t border-black/10 pt-4 flex items-center justify-between text-[10px] text-black/40 uppercase tracking-wider">
          <span>{currentYear} © ИП Жегалова Александра Сергеевна</span>
          <span>ОГРНИП 3196313300043142</span>
        </div>
      </div>
    </div>
  );
}

export function CompanyDetailsWidget() {
  return (
    <div className="border-t border-black/10 bg-neutral-50 px-6 py-6 font-sans text-[11px] text-neutral-600">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start gap-6">
        <div className="space-y-1.5 min-w-[300px]">
          <span className="font-semibold text-neutral-900 uppercase tracking-widest text-[9px] block">Реквизиты продавца:</span>
          <p className="font-medium text-neutral-800">ИП Жегалова Александра Сергеевна</p>
          <p>ИНН: 631625819168 | ОГРНИП: 3196313300043142</p>
          <p>Email для связи: <a href="mailto:miafleksa@yandex.ru" className="underline text-[#9c27b0] font-semibold">miafleksa@yandex.ru</a></p>
        </div>
        <div className="space-y-1.5 min-w-[300px]">
          <span className="font-semibold text-neutral-900 uppercase tracking-widest text-[9px] block">Банковские реквизиты:</span>
          <p>р/с: 40802810070010212258</p>
          <p>МОСКОВСКИЙ ФИЛИАЛ АО КБ «МОДУЛЬБАНК»</p>
          <p>БИК: 044525092 | к/с: 30101810645250000092</p>
        </div>
        <div className="space-y-2 max-w-[350px]">
          <span className="font-semibold text-neutral-900 uppercase tracking-widest text-[9px] block">Важная информация:</span>
          <p className="leading-relaxed opacity-80">
            Оплата услуг производится в безналичном порядке. По всем вопросам предоставления доступа, активации PRO, а также для возврата платежей обращайтесь напрямую на адрес электронной почты.
          </p>
        </div>
      </div>
    </div>
  );
}
