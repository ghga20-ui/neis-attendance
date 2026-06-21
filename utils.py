import os.path
import time
from tkinter import messagebox, filedialog
import pandas as pd
from selenium.webdriver import Keys
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException, StaleElementReferenceException, WebDriverException
from selenium.webdriver.common.action_chains import ActionChains
from logger_config import logger
from functools import wraps
import config
from regions import get_neis_url

# URL 정보 (동적으로 교육청에 따라 변경됨)
def get_urls():
    """현재 선택된 교육청에 맞는 URL 딕셔너리를 반환"""
    base_url = get_neis_url(config.selected_region)
    return {
        '나이스 로그인': base_url
    }

# 재시도 로직: 네트워크 오류나 일시적인 Selenium 오류 처리
def retry_on_error(max_retries=3, delay=2, exceptions=(TimeoutException, NoSuchElementException, StaleElementReferenceException, WebDriverException)):
    """
    함수 실행 중 지정된 예외 발생 시 재시도하는 데코레이터

    Args:
        max_retries: 최대 재시도 횟수 (기본 3회)
        delay: 재시도 전 대기 시간(초) (기본 2초)
        exceptions: 재시도할 예외 타입들 (기본: Selenium 관련 예외들)
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    last_exception = e
                    if attempt < max_retries - 1:
                        logger.warning(f"{func.__name__} 실행 실패 (시도 {attempt + 1}/{max_retries}): {e}")
                        logger.info(f"{delay}초 후 재시도합니다...")
                        time.sleep(delay)
                    else:
                        logger.error(f"{func.__name__} 최종 실패 ({max_retries}회 시도): {e}")
            raise last_exception
        return wrapper
    return decorator


def login(driver, password):
    """업무포털에서 로그인하는 함수 (비밀번호 인자 사용)"""
    # ➊ 간단한 모달창 제거 (로그인 버튼이 가려질 수 있으므로)
    try:
        # 간단한 JavaScript로 모달만 제거
        driver.execute_script("""
            var modals = document.querySelectorAll('.modal, .modal-bg, .popup, .overlay, [role="dialog"]');
            for (var i = 0; i < modals.length; i++) {
                if (modals[i].style.display !== 'none') {
                    modals[i].style.display = 'none';
                }
            }
        """)
        logger.info("간단한 모달 제거 완료")
        time.sleep(1)
    except Exception as e:
        logger.warning(f"모달 제거 실패: {e}")

    # ➋ 로그인 버튼 찾기 및 클릭 (강화된 방법)
    logger.info("로그인 버튼 찾기 시작")

    # 먼저 JavaScript로 직접 클릭 시도
    try:
        driver.execute_script("""
            var btn = document.querySelector('button.elec-log-btn, button[id="btnLgn"]');
            if (btn) {
                btn.click();
                return 'success';
            }
            return 'not found';
        """)
        logger.info("JavaScript로 로그인 버튼 클릭 완료")
        time.sleep(2)  # 로그인 페이지 로드 대기
    except Exception as js_error:
        logger.warning(f"JavaScript 로그인 버튼 클릭 실패: {js_error}")

        # 일반적인 방법으로 시도
        try:
            login_button = driver.find_element(By.CSS_SELECTOR, 'button.elec-log-btn')
            driver.execute_script("arguments[0].scrollIntoView(true);", login_button)
            time.sleep(1)
            driver.execute_script("arguments[0].click();", login_button)
            logger.info("일반 방법으로 로그인 버튼 클릭 완료")
            time.sleep(2)
        except Exception as normal_error:
            logger.error(f"일반 로그인 버튼 클릭도 실패: {normal_error}")
            raise Exception("로그인 버튼 클릭 실패")
    time.sleep(1)  # 페이지 로드 대기

    # ➌ 비밀번호 입력창 찾기 및 입력 (강화된 방법)
    logger.info("비밀번호 입력창 찾기 시작")
    password_input = None
    password_selectors = [
        'input.kc-pw-box',
        'input[type="password"]',
        'input[name*="password"]',
        'input[id*="password"]',
        'input[placeholder*="비밀번호"]'
    ]

    for selector in password_selectors:
        try:
            password_input = driver.find_element(By.CSS_SELECTOR, selector)
            logger.info(f"비밀번호 입력창 발견: {selector}")
            break
        except:
            continue

    if password_input:
        try:
            password_input.clear()  # 기존 내용 지우기
            password_input.send_keys(password)  # 비밀번호 입력
            logger.info("비밀번호 입력 완료")
        except Exception as e:
            logger.warning(f"비밀번호 입력 실패: {e}")
            raise Exception("비밀번호 입력 실패")
    else:
        logger.error("비밀번호 입력창을 찾을 수 없습니다.")
        raise Exception("비밀번호 입력창을 찾을 수 없습니다.")

    # ➌ 확인 버튼 찾기 및 클릭
    confirm_button = driver.find_element(By.CSS_SELECTOR, 'button.kc-btn-blue')
    confirm_button.click()
    time.sleep(2) # 페이지 로드 대기


@retry_on_error(max_retries=3, delay=2)
def open_neis_direct(driver, password):
    """나이스에 직접 접속하여 인증서 로그인하는 함수 (업무포털 우회)"""
    logger.info("나이스 직접 로그인 시작")
    
    # ➊ 나이스 로그인 페이지 접속 (동적 URL 사용)
    neis_url = get_urls()['나이스 로그인']
    logger.info(f"나이스 접속 URL: {neis_url}")
    driver.get(neis_url)
    driver.maximize_window()
    
    # 페이지 로드 대기
    WebDriverWait(driver, 10).until(
        lambda d: d.execute_script("return document.readyState") == "complete"
    )
    logger.info("나이스 로그인 페이지 로드 완료")
    time.sleep(1)
    
    # ➋ '인증서 로그인' 버튼 클릭 (개선된 버전)
    logger.info("인증서 로그인 버튼 찾기 시작")
    cert_login_clicked = False
    
    # 방법 1: CSS Selector (개선된 셀렉터 목록 - 실제 HTML 구조 기반)
    cert_selectors = [
        # 가장 정확한 셀렉터들 (role="button" 활용)
        'div.btn-login[role="button"]',
        'div.btn-login-i[role="button"]',
        # 내부 요소
        'div.btn-login a.cl-text-wrapper',
        '.btn-login-i a.cl-text-wrapper',
        # 텍스트 포함 요소
        'div.btn-login .cl-text',
        # 기존 호환성
        'div.btn-login',
        '.btn-login a',
    ]
    
    for selector in cert_selectors:
        try:
            # 요소 찾기 + 표시될 때까지 대기
            btn = WebDriverWait(driver, 3).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, selector))
            )
            if btn.is_displayed():
                driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", btn)
                time.sleep(0.5)
                # 클릭 시도: JavaScript
                driver.execute_script("arguments[0].click();", btn)
                logger.info(f"인증서 로그인 버튼 클릭 성공: {selector}")
                cert_login_clicked = True
                break
        except Exception:
            continue
    
    # 방법 2: XPath로 텍스트 기반 검색 (개선된 패턴)
    if not cert_login_clicked:
        xpath_patterns = [
            "//div[contains(@class, 'btn-login')][@role='button']",
            "//div[contains(@class, 'btn-login')]//div[contains(text(), '인증서')]/..",
            "//div[contains(@class, 'cl-text') and contains(text(), '인증서 로그인')]/ancestor::div[@role='button']",
            "//*[contains(text(), '인증서 로그인')]",
        ]
        for xpath in xpath_patterns:
            try:
                btn = driver.find_element(By.XPATH, xpath)
                if btn.is_displayed():
                    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", btn)
                    time.sleep(0.3)
                    driver.execute_script("arguments[0].click();", btn)
                    logger.info(f"XPath로 인증서 로그인 버튼 클릭 성공: {xpath}")
                    cert_login_clicked = True
                    break
            except Exception:
                continue
    
    # 방법 3: JavaScript로 직접 검색 및 클릭 (개선된 버전)
    if not cert_login_clicked:
        try:
            result = driver.execute_script("""
                // 1. role="button"인 요소 중 '인증서' 텍스트 포함된 것
                var buttons = document.querySelectorAll('[role="button"]');
                for (var i = 0; i < buttons.length; i++) {
                    if (buttons[i].textContent.includes('인증서')) {
                        buttons[i].click();
                        return 'clicked role button: ' + buttons[i].className;
                    }
                }
                // 2. btn-login 클래스 요소
                var loginBtns = document.querySelectorAll('.btn-login, .btn-login-i');
                for (var i = 0; i < loginBtns.length; i++) {
                    if (loginBtns[i].textContent.includes('인증서')) {
                        loginBtns[i].click();
                        return 'clicked btn-login: ' + loginBtns[i].className;
                    }
                }
                // 3. cl-text 중 '인증서 로그인' 텍스트
                var texts = document.querySelectorAll('.cl-text');
                for (var i = 0; i < texts.length; i++) {
                    if (texts[i].textContent.trim() === '인증서 로그인') {
                        var parent = texts[i].closest('[role="button"]') || texts[i].parentElement;
                        if (parent) {
                            parent.click();
                            return 'clicked via cl-text parent: ' + parent.className;
                        }
                    }
                }
                return 'not found';
            """)
            logger.info(f"JavaScript 인증서 로그인 버튼 클릭 결과: {result}")
            if 'clicked' in result:
                cert_login_clicked = True
        except Exception as e:
            logger.warning(f"JavaScript 클릭 실패: {e}")
    
    # 방법 4: ActionChains 사용 (마우스 이벤트)
    if not cert_login_clicked:
        try:
            from selenium.webdriver.common.action_chains import ActionChains
            btn = driver.find_element(By.CSS_SELECTOR, 'div.btn-login[role="button"], div.btn-login')
            if btn.is_displayed():
                ActionChains(driver).move_to_element(btn).click().perform()
                logger.info("ActionChains로 인증서 로그인 버튼 클릭 성공")
                cert_login_clicked = True
        except Exception as e:
            logger.warning(f"ActionChains 클릭 실패: {e}")
    
    if not cert_login_clicked:
        logger.error("인증서 로그인 버튼을 찾을 수 없습니다.")
        raise Exception("인증서 로그인 버튼 클릭 실패")
    
    time.sleep(3)  # 비밀번호 입력창 로드 대기 (더 긴 시간)
    
    # ➌ 비밀번호 입력창 찾기 및 입력 (기존 로직 재사용)
    logger.info("비밀번호 입력창 찾기 시작")
    password_input = None
    password_selectors = [
        'input.kc-pw-box',
        'input[type="password"]',
        'input[name*="password"]',
        'input[id*="password"]',
        'input[placeholder*="비밀번호"]'
    ]
    
    # 비밀번호 입력창이 나타나고 상호작용 가능해질 때까지 대기
    try:
        password_input = WebDriverWait(driver, 15).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, 'input.kc-pw-box, input[type="password"]'))
        )
        logger.info("비밀번호 입력창 클릭 가능 상태 확인")
    except TimeoutException:
        logger.warning("비밀번호 입력창 대기 타임아웃, 수동 검색 시도")
        for selector in password_selectors:
            try:
                password_input = driver.find_element(By.CSS_SELECTOR, selector)
                logger.info(f"비밀번호 입력창 발견: {selector}")
                break
            except:
                continue
    
    if password_input:
        try:
            # 먼저 일반적인 방법 시도
            time.sleep(1)  # 추가 대기
            password_input.click()
            password_input.clear()
            password_input.send_keys(password)
            logger.info("비밀번호 입력 완료")
        except Exception as e:
            logger.warning(f"일반 비밀번호 입력 실패, JavaScript로 시도: {e}")
            # JavaScript로 직접 입력 시도
            try:
                driver.execute_script("""
                    var input = arguments[0];
                    input.value = arguments[1];
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                """, password_input, password)
                logger.info("JavaScript로 비밀번호 입력 완료")
            except Exception as js_error:
                logger.error(f"JavaScript 비밀번호 입력도 실패: {js_error}")
                raise Exception("비밀번호 입력 실패")
    else:
        logger.error("비밀번호 입력창을 찾을 수 없습니다.")
        raise Exception("비밀번호 입력창을 찾을 수 없습니다.")
    
    # ➍ 확인 버튼 클릭 (JavaScript 사용)
    try:
        confirm_button = driver.find_element(By.CSS_SELECTOR, 'button.kc-btn-blue')
        # JavaScript로 클릭 시도
        driver.execute_script("arguments[0].scrollIntoView(true);", confirm_button)
        time.sleep(0.5)
        driver.execute_script("arguments[0].click();", confirm_button)
        logger.info("확인 버튼 클릭 완료 (JavaScript)")
    except Exception as e:
        logger.warning(f"첫 번째 확인 버튼 클릭 실패: {e}, 대안 시도")
        # 대안: JavaScript로 직접 버튼 찾아서 클릭
        try:
            driver.execute_script("""
                var btn = document.querySelector('button.kc-btn-blue');
                if (btn) btn.click();
            """)
            logger.info("확인 버튼 클릭 완료 (JavaScript 직접)")
        except Exception as js_error:
            logger.error(f"확인 버튼 클릭 실패: {js_error}")
            raise Exception("확인 버튼 클릭 실패")
    
    # ➎ 나이스 메인 페이지 로드 대기
    time.sleep(3)
    try:
        WebDriverWait(driver, 15).until(
            lambda d: '나이스' in d.title or 'neis' in d.current_url.lower()
        )
        logger.info(f"나이스 메인 페이지 로드 완료 - 제목: {driver.title}")
    except TimeoutException:
        logger.warning("나이스 메인 페이지 대기 타임아웃 - 현재 상태로 진행")
    
    logger.info("나이스 직접 로그인 완료")




@retry_on_error(max_retries=3, delay=2)
def neis_go_menu(driver, level1, level2, level3, level4=None):
    close_all_modals(driver)
    """NEIS 메뉴 네비게이션 함수 (level4까지 지원)"""
    print(f"[디버깅] neis_go_menu 시작: {level1} > {level2} > {level3}" + (f" > {level4}" if level4 else ""))
    print(f"[디버깅] 현재 페이지 제목: {driver.title}")
    print(f"[디버깅] 현재 URL: {driver.current_url}")
    
    # 이미 나이스에 로그인되어 있으므로 탭 전환 불필요
    print(f"[디버깅] 현재 탭 - 페이지 제목: {driver.title}")
    print(f"[디버깅] 현재 탭 - URL: {driver.current_url}")

    # ➋ 1차 네비게이션 메뉴 선택
    print(f"[디버깅] 1차 메뉴 '{level1}' 찾기 시도...")
    try:
        first_level_items = driver.find_element(By.CSS_SELECTOR, 'ul.cl-navigationbar-bar').find_elements(By.TAG_NAME, 'li')
        print(f"[디버깅] 1차 메뉴 개수: {len(first_level_items)}")
        
        for i, first_item in enumerate(first_level_items):
            try:
                item_text = first_item.text.strip()
                print(f"[디버깅] 1차 메뉴 {i+1}: '{item_text}'")
                if level1 in item_text:
                    print(f"[디버깅] 1차 메뉴 '{level1}' 발견! 클릭 시도...")
                    first_item.click()
                    time.sleep(2)
                    print(f"[디버깅] 1차 메뉴 클릭 완료")
                    break
            except Exception as e:
                print(f"[디버깅] 1차 메뉴 {i+1} 처리 실패: {e}")
        else:
            print(f"[디버깅] 1차 메뉴 '{level1}'을 찾을 수 없습니다!")
            return
    except Exception as e:
        print(f"[디버깅] 1차 메뉴 찾기 실패: {e}")
        return

    # 2차 메뉴 명시적 대기
    print(f"[디버깅] 2차 메뉴 '{level2}' 명시적 대기 시작...")
    try:
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'div.cl-navigationbar-listitem-wrapper'))
        )
        print(f"[디버깅] 2차 메뉴 '{level2}' 명시적 대기 성공!")
    except Exception as e:
        print(f"[디버깅] 2차 메뉴 명시적 대기 실패: {e}")

    # ➌ 2차 네비게이션 메뉴와 3차 메뉴 선택
    print(f"[디버깅] 2차 메뉴 '{level2}' 찾기 시도...")
    try:
        second_level_items = driver.find_elements(By.CSS_SELECTOR, 'div.cl-navigationbar-listitem-wrapper')
        print(f"[디버깅] 2차 메뉴 개수: {len(second_level_items)}")
        
        for i, second_item in enumerate(second_level_items):
            try:
                item_text = second_item.text.strip()
                print(f"[디버깅] 2차 메뉴 {i+1}: '{item_text}'")
                if level2 in item_text:
                    print(f"[디버깅] 2차 메뉴 '{level2}' 발견! 3차 메뉴 찾기 시도...")
                    third_level_items = second_item.find_elements(By.TAG_NAME, 'li')
                    print(f"[디버깅] 3차 메뉴 개수: {len(third_level_items)}")
                    for j, third_item in enumerate(third_level_items):
                        try:
                            third_text = third_item.text.strip()
                            print(f"[디버깅] 3차 메뉴 {j+1}: '{third_text}'")
                            if level3 in third_text:
                                print(f"[디버깅] 3차 메뉴 '{level3}' 발견! 클릭 시도...")
                                third_item.click()
                                time.sleep(2)
                                print(f"[디버깅] 3차 메뉴 클릭 완료")
                                # level4가 있으면 4차 메뉴 탐색
                                if level4:
                                    print(f"[디버깅] 4차 메뉴 '{level4}' 탐색 시작...")
                                    try:
                                        # 4차 메뉴는 별도의 사이드 네비게이션에서 찾음
                                        WebDriverWait(driver, 10).until(
                                            EC.presence_of_element_located((By.CSS_SELECTOR, 'a.cl-leaf.cl-level-2.cl-sidenavigation-item'))
                                        )
                                        leaf_items = driver.find_elements(By.CSS_SELECTOR, 'a.cl-leaf.cl-level-2.cl-sidenavigation-item')
                                        print(f"[디버깅] 4차 메뉴 후보 개수: {len(leaf_items)}")
                                        found4 = False
                                        for k, leaf in enumerate(leaf_items):
                                            leaf_text = leaf.text.strip()
                                            print(f"[디버깅] 4차 메뉴 {k+1}: '{leaf_text}'")
                                            if level4 in leaf_text:
                                                print(f"[디버깅] 4차 메뉴 '{level4}' 발견! 클릭 시도...")
                                                leaf.click()
                                                time.sleep(2)
                                                print(f"[디버깅] 4차 메뉴 클릭 완료")
                                                found4 = True
                                                break
                                        if not found4:
                                            print(f"[오류] 4차 메뉴 '{level4}'을 찾을 수 없습니다!")
                                        return
                                    except Exception as e:
                                        print(f"[오류] 4차 메뉴 탐색 실패: {e}")
                                        return
                                # level4가 없으면 여기서 종료
                                return
                        except Exception as e:
                            print(f"[디버깅] 3차 메뉴 {j+1} 처리 실패: {e}")
                    else:
                        print(f"[디버깅] 3차 메뉴 '{level3}'을 찾을 수 없습니다!")
                        return
            except Exception as e:
                print(f"[디버깅] 2차 메뉴 {i+1} 처리 실패: {e}")
        else:
            print(f"[디버깅] 2차 메뉴 '{level2}'을 찾을 수 없습니다!")
            return
    except Exception as e:
        print(f"[디버깅] 2차 메뉴 찾기 실패: {e}")
        return




def click_neis_button(driver):
    close_all_portal_modals(driver)
    """
    업무포털 메인화면에서 '나이스' 버튼을 클릭하여 NEIS 탭을 여는 함수.
    모달이 있는 경우 사라질 때까지 기다림.
    """
    try:
        try:
            WebDriverWait(driver, 30).until(
                EC.invisibility_of_element_located((By.CSS_SELECTOR, 'div.modal-bg.main'))
            )
            time.sleep(1)
        except TimeoutException:
            driver.execute_script("""
                var modal = document.querySelector('div.modal-bg.main');
                if (modal) { modal.style.display = 'none'; }
            """)
            time.sleep(0.5)  # 강제 숨김 후 잠깐 대기
        # 나이스 버튼 클릭 (예외 발생 시 최대 3회 재시도)
        initial_handles = len(driver.window_handles)
        for attempt in range(3):
            try:
                try:
                    neis_btn = driver.find_element(By.XPATH, '//a[@class="menuBtn" and contains(text(), "나이스")]')
                except Exception:
                    neis_btn = driver.find_element(By.CSS_SELECTOR, 'a.menuBtn')
                neis_btn.click()
                # 새 탭이 생성될 때까지 대기 (최대 10초)
                WebDriverWait(driver, 10).until(
                    lambda d: len(d.window_handles) > initial_handles
                )
                print("[디버깅] 나이스 버튼 클릭 후 새 탭 생성 확인")
                break
            except Exception as e:
                print(f"[디버깅] 나이스 버튼 클릭 실패, {attempt+1}회 재시도: {e}")
                time.sleep(1)
        all_handles = driver.window_handles
        if len(all_handles) > 1:
            driver.switch_to.window(all_handles[-1])
        if "나이스" not in driver.title and "neis" not in driver.current_url.lower():
            driver.execute_script("window.open('');")
            driver.switch_to.window(driver.window_handles[-1])
            driver.get(urls['나이스'])
            # 페이지가 완전히 로드될 때까지 대기
            WebDriverWait(driver, 10).until(
                lambda d: d.execute_script("return document.readyState") == "complete"
            )
            print("[디버깅] 나이스 페이지 로드 완료")
    except TimeoutException:
        raise Exception("[오류] 모달이 사라지지 않아 '나이스' 버튼을 클릭할 수 없습니다.")
    except Exception as e:
        raise Exception(f"[오류] 나이스 버튼 클릭 실패: {e}")

@retry_on_error(max_retries=3, delay=1)
def neis_click_btn(driver, button_name):
    """NEIS에서 버튼 클릭을 처리하는 함수"""
    # ➊ 버튼 목록 가져오기
    buttons = driver.find_elements(By.CSS_SELECTOR, 'a.cl-text-wrapper')

    # ➋ 주어진 버튼 이름과 일치하는 버튼 클릭
    for button in buttons:
        if button_name == button.text:
            button.click()
            time.sleep(1)
            break


@retry_on_error(max_retries=3, delay=1)
def select_combobox_option_by_visible_text(driver, label_text, option_text):
    # 1. 콤보박스 버튼 클릭
    combos = []
    for c in driver.find_elements(By.CSS_SELECTOR, "div.cl-combobox"):
        try:
            cl_text = c.find_element(By.CSS_SELECTOR, ".cl-text")
            aria_label = cl_text.get_attribute("aria-label")
            print(f"[디버깅] 콤보박스 aria-label: {aria_label}")
            if aria_label and aria_label.startswith(label_text):
                combos.append(c)
        except Exception as e:
            print(f"[디버깅] 콤보박스 내부 .cl-text/aria-label 없음: {e}")
    if not combos:
        print(f"[오류] '{label_text}'로 시작하는 콤보박스를 찾을 수 없습니다.")
        return
    combo = combos[0]
    combo_btn = combo.find_element(By.CSS_SELECTOR, ".cl-combobox-button")
    combo_btn.click()
    print("[디버깅] 콤보박스 버튼 클릭 완료")
    import time
    time.sleep(0.3)

    # 2. 드롭다운 항목 모두 출력 및 원하는 항목 클릭
    try:
        # 드롭다운이 열릴 때까지 대기
        WebDriverWait(driver, 5).until(
            lambda d: len(d.find_elements(By.CSS_SELECTOR, "div.cl-combobox-item[role='option']")) > 0
        )
        items = driver.find_elements(By.CSS_SELECTOR, "div.cl-combobox-item[role='option']")
        print(f"[디버깅] 드롭다운 항목 개수: {len(items)}")
        found = False
        for item in items:
            text = item.find_element(By.CSS_SELECTOR, ".cl-text").text.strip()
            print(f"[디버깅] 드롭다운 항목: '{text}'")
            if text == str(option_text):
                item.click()
                print(f"[디버깅] '{option_text}' 항목 클릭 완료")
                found = True
                break
        if not found:
            print(f"[오류] '{option_text}' 항목을 찾을 수 없음")
    except Exception as e:
        print(f"[오류] 드롭다운 항목 탐색/클릭 실패: {e}")



def close_all_modals(driver, max_attempts=15):
    """모든 모달창을 강력하게 제거하는 함수"""
    from selenium.webdriver.common.by import By
    import time
    attempts = 0
    
    print("[디버깅] 강화된 모달 제거 시작")
    
    # 1. 다양한 모달 닫기 버튼 패턴
    close_selectors = [
        # NEIS 시스템 모달
        "div.cl-dialog-close[role='button'][aria-label='닫기']",
        "div[role='button'][aria-label='닫기']",
        "button[aria-label='닫기']",
        "button.btn-close",
        "button.pop-bottom-close", 
        "button.btn-2x",
        "a[aria-label='닫기']",
        "span[aria-label='닫기']",
        ".close",
        ".btn-close",
        "[data-dismiss='modal']",
        # 일반적인 모달 패턴
        "button:contains('닫기')",
        "button:contains('취소')",
        "button:contains('X')",
        "div.modal-close",
        "div.popup-close",
        "span.close-icon",
        # ESC 키로 닫을 수 있는 모달들
        "div[class*='modal']",
        "div[class*='popup']",
        "div[class*='overlay']"
    ]
    
    while attempts < max_attempts:
        modals_found = False
        
        # 2. 각 패턴으로 닫기 버튼 찾기
        for selector in close_selectors:
            try:
                if ":contains(" in selector:
                    # 텍스트 포함 검색은 XPath 사용
                    text_content = selector.split('contains(')[1].split(')')[0].strip("'\"")
                    xpath_selector = f"//*[contains(text(), '{text_content}')]"
                    close_btns = driver.find_elements(By.XPATH, xpath_selector)
                else:
                    close_btns = driver.find_elements(By.CSS_SELECTOR, selector)
                
                visible_btns = [btn for btn in close_btns if btn.is_displayed()]
                if visible_btns:
                    try:
                        # 가장 최상단 모달의 닫기 버튼 클릭
                        visible_btns[-1].click()
                        print(f"[디버깅] {attempts+1}번째 모달 닫기 완료 (셀렉터: {selector})")
                        modals_found = True
                        time.sleep(0.3)
                        break
                    except Exception as click_error:
                        print(f"[경고] 클릭 실패: {click_error}, JavaScript로 재시도")
                        try:
                            driver.execute_script("arguments[0].click();", visible_btns[-1])
                            print(f"[디버깅] JavaScript로 모달 닫기 완료")
                            modals_found = True
                            time.sleep(0.3)
                            break
                        except Exception as js_error:
                            print(f"[경고] JavaScript 클릭도 실패: {js_error}")
                            continue
            except Exception as e:
                continue
        
        if not modals_found:
            # 3. JavaScript로 강제 모달 제거
            try:
                driver.execute_script("""
                    // 모든 모달 관련 요소 제거
                    var modals = document.querySelectorAll('.modal, .modal-bg, .popup, .overlay, [role="dialog"], .cl-dialog, .popup-layer, .modal-layer');
                    var removed = 0;
                    for (var i = 0; i < modals.length; i++) {
                        if (modals[i].style.display !== 'none') {
                            modals[i].style.display = 'none';
                            modals[i].style.visibility = 'hidden';
                            removed++;
                        }
                    }
                    // 모달 배경 제거
                    var backgrounds = document.querySelectorAll('.modal-backdrop, .popup-backdrop, .overlay-background');
                    for (var i = 0; i < backgrounds.length; i++) {
                        backgrounds[i].style.display = 'none';
                        backgrounds[i].remove();
                    }
                    return removed;
                """)
                print("[디버깅] JavaScript로 모달 강제 제거 시도")
                time.sleep(0.5)
            except Exception as js_error:
                print(f"[경고] JavaScript 모달 제거 실패: {js_error}")
            
            # 4. ESC 키로 모달 닫기 시도
            try:
                from selenium.webdriver.common.keys import Keys
                driver.find_element(By.TAG_NAME, 'body').send_keys(Keys.ESCAPE)
                print("[디버깅] ESC 키로 모달 닫기 시도")
                time.sleep(0.3)
            except Exception as esc_error:
                print(f"[경고] ESC 키 모달 닫기 실패: {esc_error}")
            
            # 5. 더 이상 모달이 없으면 종료
            remaining_modals = driver.find_elements(By.CSS_SELECTOR, 
                '.modal:not([style*="display: none"]), .popup:not([style*="display: none"]), [role="dialog"]:not([style*="display: none"])')
            if not remaining_modals:
                print("[디버깅] 모든 모달이 제거되었습니다.")
                break
        
        attempts += 1
    
    if attempts >= max_attempts:
        print("[경고] 모달 닫기 최대 시도 횟수 도달. 일부 모달이 남아있을 수 있음.")
    
    # 6. 최종 정리: JavaScript로 남은 모달들 강제 제거
    try:
        driver.execute_script("""
            // 남은 모달들 모두 강제 제거
            var remainingModals = document.querySelectorAll('.modal, .modal-bg, .popup, .overlay, [role="dialog"], .cl-dialog, .popup-layer, .modal-layer');
            var removed = 0;
            for (var i = 0; i < remainingModals.length; i++) {
                remainingModals[i].style.display = 'none';
                remainingModals[i].style.visibility = 'hidden';
                remainingModals[i].style.opacity = '0';
                remainingModals[i].style.pointerEvents = 'none';
                removed++;
            }
            return removed;
        """)
        print("[디버깅] 최종 JavaScript 모달 정리 완료")
    except Exception as e:
        print(f"[경고] 최종 모달 정리 실패: {e}")
    
    print("[디버깅] 강화된 모달 제거 완료")

def close_all_portal_modals(driver, max_attempts=10):
    import time
    attempts = 0
    
    print("[디버깅] 업무포털 모달 닫기 시작")
    
    while attempts < max_attempts:
        # 1. 다양한 닫기 버튼 패턴으로 검색
        close_selectors = [
            "button[aria-label='닫기']",
            "button[aria-label='닫기']",
            "button.btn-close",
            "button.pop-bottom-close", 
            "button.btn-2x",
            "div[role='button'][aria-label='닫기']",
            "a[aria-label='닫기']",
            "span[aria-label='닫기']",
            "button:contains('닫기')",
            "button:contains('취소')",
            "button:contains('X')",
            ".close",
            ".btn-close",
            "[data-dismiss='modal']"
        ]
        
        all_close_btns = []
        for selector in close_selectors:
            try:
                btns = driver.find_elements(By.CSS_SELECTOR, selector)
                all_close_btns.extend(btns)
            except Exception:
                continue
        
        # 2. 텍스트 기반으로도 검색 (닫기, 취소, X 등)
        try:
            all_buttons = driver.find_elements(By.TAG_NAME, "button")
            for btn in all_buttons:
                try:
                    btn_text = btn.text.strip().lower()
                    if any(keyword in btn_text for keyword in ['닫기', '취소', 'x', 'close', 'cancel']):
                        all_close_btns.append(btn)
                except:
                    continue
        except Exception:
            pass
        
        # 중복 제거
        unique_btns = []
        seen = set()
        for btn in all_close_btns:
            try:
                btn_id = f"{btn.tag_name}_{btn.get_attribute('class')}_{btn.get_attribute('aria-label')}_{btn.text}"
                if btn_id not in seen:
                    seen.add(btn_id)
                    unique_btns.append(btn)
            except:
                continue
        
        print(f"[디버깅] {attempts+1}회차: 찾은 닫기 버튼 개수: {len(unique_btns)}")
        
        # 3. 보이는 버튼만 필터링
        visible_btns = []
        for btn in unique_btns:
            try:
                if btn.is_displayed() and btn.is_enabled():
                    visible_btns.append(btn)
            except:
                continue
        
        print(f"[디버깅] {attempts+1}회차: 보이는 닫기 버튼 개수: {len(visible_btns)}")
        
        if not visible_btns:
            print(f"[디버깅] {attempts+1}회차: 더 이상 보이는 닫기 버튼 없음.")
            
            # 4. JavaScript로 강제 모달 제거 시도
            try:
                driver.execute_script("""
                    // 모든 모달 관련 요소 제거
                    var modals = document.querySelectorAll('.modal, .modal-bg, .popup, .overlay, [role="dialog"]');
                    for (var i = 0; i < modals.length; i++) {
                        modals[i].style.display = 'none';
                        modals[i].remove();
                    }
                    
                    // body의 overflow 스타일 복원
                    document.body.style.overflow = 'auto';
                    document.body.style.pointerEvents = 'auto';
                """)
                print("[디버깅] JavaScript로 모달 강제 제거 시도")
                time.sleep(1)
                
                # 다시 한번 닫기 버튼 검색
                all_close_btns = []
                for selector in close_selectors:
                    try:
                        btns = driver.find_elements(By.CSS_SELECTOR, selector)
                        all_close_btns.extend(btns)
                    except Exception:
                        continue
                
                visible_btns = [btn for btn in all_close_btns if btn.is_displayed() and btn.is_enabled()]
                if not visible_btns:
                    print("[디버깅] 모든 모달이 제거되었습니다.")
                    break
            except Exception as e:
                print(f"[디버깅] JavaScript 모달 제거 실패: {e}")
                break
        
        # 5. 닫기 버튼 클릭
        try:
            btn_to_click = visible_btns[-1]  # 마지막 보이는 버튼
            print(f"[디버깅] {attempts+1}회차: '{btn_to_click.text}' 버튼 클릭 시도")
            
            # JavaScript로 클릭 (더 안정적)
            driver.execute_script("arguments[0].click();", btn_to_click)
            print(f"[디버깅] {attempts+1}회차: 클릭 완료")
            
        except Exception as e:
            print(f"[오류] {attempts+1}회차: 닫기 버튼 클릭 실패: {e}")
        
        time.sleep(1)  # 모달 사라질 때까지 대기
        attempts += 1
    
    if attempts == max_attempts:
        print("[경고] 업무포털 모달 닫기 최대 시도 횟수 도달. 일부 모달이 남아있을 수 있음.")
    
    # 6. 최종 정리: JavaScript로 남은 모달들 강제 제거
    try:
        driver.execute_script("""
            // 남은 모달들 모두 제거
            var remainingModals = document.querySelectorAll('.modal, .modal-bg, .popup, .overlay, [role="dialog"]');
            for (var i = 0; i < remainingModals.length; i++) {
                remainingModals[i].style.display = 'none';
                remainingModals[i].remove();
            }
            document.body.style.overflow = 'auto';
        """)
        print("[디버깅] 최종 JavaScript 모달 정리 완료")
    except Exception as e:
        print(f"[디버깅] 최종 모달 정리 실패: {e}")
    
    print("[디버깅] 업무포털 모달 닫기 완료")
